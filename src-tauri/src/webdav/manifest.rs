use std::{cmp::Ordering, collections::HashSet};

use chrono::{DateTime, Utc};

use super::{
    model::{BackupIndex, BackupIndexEntry, DocumentManifest, WebDavVersion, HISTORY_LIMIT},
    path::normalize_remote_root,
};

impl DocumentManifest {
    pub fn new(document_id: &str, display_name: &str, current_path: &str) -> Self {
        Self {
            document_id: document_id.to_string(),
            display_name: display_name.to_string(),
            current_path: current_path.to_string(),
            versions: Vec::new(),
        }
    }

    pub fn newest_hash(&self) -> Option<&str> {
        self.versions.first().map(|version| version.sha256.as_str())
    }

    pub fn insert_version(&mut self, version: WebDavVersion) -> Vec<WebDavVersion> {
        self.versions.push(version);
        sort_versions(&mut self.versions);

        let mut retained = Vec::with_capacity(self.versions.len().min(HISTORY_LIMIT));
        let mut pruned = Vec::new();
        let mut version_ids = HashSet::new();
        let mut content_hashes = HashSet::new();
        for candidate in self.versions.drain(..) {
            let is_duplicate =
                version_ids.contains(&candidate.id) || content_hashes.contains(&candidate.sha256);
            if is_duplicate || retained.len() == HISTORY_LIMIT {
                pruned.push(candidate);
            } else {
                version_ids.insert(candidate.id.clone());
                content_hashes.insert(candidate.sha256.clone());
                retained.push(candidate);
            }
        }
        self.versions = retained;

        let retained_paths: HashSet<_> = self
            .versions
            .iter()
            .map(|version| version.snapshot_path.as_str())
            .collect();
        let mut cleanup_paths = HashSet::new();
        pruned.retain(|version| {
            !retained_paths.contains(version.snapshot_path.as_str())
                && cleanup_paths.insert(version.snapshot_path.clone())
        });
        pruned
    }
}

fn sort_versions(versions: &mut [WebDavVersion]) {
    versions.sort_by(|left, right| {
        compare_rfc3339_desc(&left.created_at, &right.created_at)
            .then_with(|| right.id.cmp(&left.id))
            .then_with(|| right.sha256.cmp(&left.sha256))
    });
}

impl BackupIndex {
    pub fn upsert(&mut self, entry: BackupIndexEntry) {
        self.documents.push(entry);
        sort_index_entries(&mut self.documents);
        let mut document_ids = HashSet::new();
        self.documents
            .retain(|candidate| document_ids.insert(candidate.document_id.clone()));
    }
}

fn sort_index_entries(entries: &mut [BackupIndexEntry]) {
    entries.sort_by(|left, right| {
        compare_rfc3339_desc(&left.latest_at, &right.latest_at)
            .then_with(|| left.document_id.cmp(&right.document_id))
    });
}

fn compare_rfc3339_desc(left: &str, right: &str) -> Ordering {
    // Parsed resources reject invalid values. Directly constructed values still receive a
    // deterministic fallback so sorting remains total before they reach a persistence boundary.
    match (parse_utc(left), parse_utc(right)) {
        (Some(left), Some(right)) => right.cmp(&left),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => right.cmp(left),
    }
}

fn parse_utc(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&Utc))
}

pub fn parse_manifest(bytes: &[u8]) -> Result<DocumentManifest, String> {
    let mut manifest: DocumentManifest = serde_json::from_slice(bytes)
        .map_err(|error| format!("Invalid WebDAV manifest: {error}"))?;

    for version in &manifest.versions {
        DateTime::parse_from_rfc3339(&version.created_at).map_err(|error| {
            format!(
                "Invalid WebDAV manifest timestamp for version '{}': {error}",
                version.id
            )
        })?;
    }

    sort_versions(&mut manifest.versions);

    Ok(manifest)
}

pub fn parse_index(bytes: &[u8]) -> Result<BackupIndex, String> {
    let mut index: BackupIndex = serde_json::from_slice(bytes)
        .map_err(|error| format!("Invalid WebDAV backup index: {error}"))?;

    for entry in &index.documents {
        DateTime::parse_from_rfc3339(&entry.latest_at).map_err(|error| {
            format!(
                "Invalid WebDAV index timestamp for document '{}': {error}",
                entry.document_id
            )
        })?;
    }

    sort_index_entries(&mut index.documents);
    let mut document_ids = HashSet::new();
    index
        .documents
        .retain(|entry| document_ids.insert(entry.document_id.clone()));

    Ok(index)
}

pub fn validate_manifest_namespace(
    manifest: &DocumentManifest,
    expected_document_id: &str,
    remote_root: &str,
) -> Result<(), String> {
    if !is_hex_with_len(expected_document_id, 24) {
        return Err("Expected WebDAV document ID must be 24 hexadecimal characters".to_string());
    }
    if !is_hex_with_len(&manifest.document_id, 24) {
        return Err("Manifest document ID must be 24 hexadecimal characters".to_string());
    }
    if manifest.document_id != expected_document_id {
        return Err("Manifest document ID does not match the requested document".to_string());
    }

    let remote_root = normalize_remote_root(remote_root)
        .map_err(|error| format!("Invalid WebDAV remote root: {error}"))?;
    let history_root = append_namespace_path(&remote_root, ".zeditor-history");
    let versions_dir = append_namespace_path(
        &history_root,
        &format!("documents/{expected_document_id}/versions"),
    );

    validate_canonical_remote_path(&manifest.current_path, "manifest current path")?;
    if !is_strict_descendant(&manifest.current_path, &remote_root) {
        return Err("Manifest current path is outside the configured remote root".to_string());
    }
    if manifest.current_path == history_root
        || manifest
            .current_path
            .strip_prefix(&history_root)
            .is_some_and(|suffix| suffix.starts_with('/'))
    {
        return Err("Manifest current path must be outside WebDAV history".to_string());
    }

    let snapshot_prefix = format!("{versions_dir}/");
    for version in &manifest.versions {
        if !is_hex_with_len(&version.id, 24) {
            return Err(format!(
                "WebDAV version ID '{}' must be 24 hexadecimal characters",
                version.id
            ));
        }
        if !is_hex_with_len(&version.sha256, 64) {
            return Err(format!(
                "WebDAV version '{}' SHA-256 must be 64 hexadecimal characters",
                version.id
            ));
        }
        validate_canonical_remote_path(&version.snapshot_path, "version snapshot path")?;
        if !version.snapshot_path.starts_with(&snapshot_prefix)
            || version.snapshot_path.len() == snapshot_prefix.len()
        {
            return Err(format!(
                "WebDAV version '{}' snapshot path is outside its document namespace",
                version.id
            ));
        }
    }

    Ok(())
}

fn is_hex_with_len(value: &str, expected_len: usize) -> bool {
    value.len() == expected_len && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn append_namespace_path(root: &str, suffix: &str) -> String {
    if root == "/" {
        format!("/{suffix}")
    } else {
        format!("{root}/{suffix}")
    }
}

fn validate_canonical_remote_path(path: &str, label: &str) -> Result<(), String> {
    if !path.starts_with('/') {
        return Err(format!("Invalid {label}: path must be absolute"));
    }
    let normalized =
        normalize_remote_root(path).map_err(|error| format!("Invalid {label}: {error}"))?;
    if normalized != path {
        return Err(format!("Invalid {label}: path is not canonical"));
    }
    Ok(())
}

fn is_strict_descendant(path: &str, root: &str) -> bool {
    if root == "/" {
        path.starts_with('/') && path != "/"
    } else {
        path.strip_prefix(root)
            .is_some_and(|suffix| suffix.starts_with('/'))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(id: &str, created_at: &str, sha256: &str, snapshot_path: &str) -> WebDavVersion {
        WebDavVersion {
            id: id.to_string(),
            created_at: created_at.to_string(),
            size: 1,
            sha256: sha256.to_string(),
            snapshot_path: snapshot_path.to_string(),
        }
    }

    fn index_entry(document_id: &str, latest_at: &str) -> BackupIndexEntry {
        BackupIndexEntry {
            document_id: document_id.to_string(),
            display_name: format!("{document_id}.md"),
            current_path: format!("/Zeditor/{document_id}.md"),
            manifest_path: format!("/history/{document_id}/manifest.json"),
            latest_at: latest_at.to_string(),
        }
    }

    fn namespaced_manifest() -> DocumentManifest {
        let document_id = "a".repeat(24);
        let version_id = "b".repeat(24);
        DocumentManifest {
            document_id: document_id.clone(),
            display_name: "note.md".to_string(),
            current_path: "/Zeditor/project-1234567890abcdef12345678/note.md".to_string(),
            versions: vec![version(
                &version_id,
                "2026-08-19T12:00:00Z",
                &"c".repeat(64),
                &format!(
                    "/Zeditor/.zeditor-history/documents/{document_id}/versions/{version_id}.md"
                ),
            )],
        }
    }

    #[test]
    fn document_manifest_deduplicates_and_keeps_twenty_newest_versions() {
        let mut manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/notes/note.md");
        let mut limit_pruned = Vec::new();

        for index in 0..21 {
            limit_pruned.extend(manifest.insert_version(WebDavVersion {
                id: format!("v{index:02}"),
                created_at: format!("2026-08-19T12:{index:02}:00Z"),
                size: index,
                sha256: format!("hash-{index}"),
                snapshot_path: format!("/history/v{index:02}.md"),
            }));
        }

        let duplicate = manifest.versions[0].clone();
        manifest.insert_version(duplicate.clone());

        assert_eq!(manifest.versions.len(), 20);
        assert_eq!(manifest.versions[0].id, "v20");
        assert_eq!(
            limit_pruned
                .iter()
                .map(|version| version.id.as_str())
                .collect::<Vec<_>>(),
            vec!["v00"]
        );
        assert_eq!(
            manifest
                .versions
                .iter()
                .filter(|version| version.sha256 == duplicate.sha256)
                .count(),
            1
        );
    }

    #[test]
    fn duplicate_versions_are_returned_for_snapshot_cleanup() {
        let mut manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        let old = version(
            "old",
            "2026-08-19T10:00:00Z",
            "same-hash",
            "/history/old.md",
        );
        manifest.insert_version(old.clone());

        let pruned = manifest.insert_version(version(
            "new",
            "2026-08-19T11:00:00Z",
            "same-hash",
            "/history/new.md",
        ));

        assert_eq!(pruned, vec![old]);
        assert_eq!(manifest.versions[0].id, "new");
    }

    #[test]
    fn older_incoming_duplicate_never_replaces_newer_version() {
        let mut manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        let newer = version(
            "newer",
            "2026-08-19T11:00:00Z",
            "same-hash",
            "/history/newer.md",
        );
        manifest.insert_version(newer.clone());
        let older = version(
            "older",
            "2026-08-19T10:00:00Z",
            "same-hash",
            "/history/older.md",
        );

        let pruned = manifest.insert_version(older.clone());

        assert_eq!(manifest.versions, vec![newer]);
        assert_eq!(pruned, vec![older]);
    }

    #[test]
    fn replacement_does_not_prune_a_reused_snapshot_path() {
        let mut manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        manifest.insert_version(version(
            "same-id",
            "2026-08-19T10:00:00Z",
            "old-hash",
            "/history/shared.md",
        ));

        let pruned = manifest.insert_version(version(
            "same-id",
            "2026-08-19T11:00:00Z",
            "new-hash",
            "/history/shared.md",
        ));

        assert!(pruned.is_empty());
    }

    #[test]
    fn manifest_orders_rfc3339_timestamps_by_utc_instant() {
        let mut manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        manifest.insert_version(version(
            "earlier",
            "2026-08-19T10:30:00+02:00",
            "hash-earlier",
            "/history/earlier.md",
        ));
        manifest.insert_version(version(
            "newer",
            "2026-08-19T09:00:00Z",
            "hash-newer",
            "/history/newer.md",
        ));

        assert_eq!(manifest.versions[0].id, "newer");
        assert_eq!(manifest.newest_hash(), Some("hash-newer"));
    }

    #[test]
    fn backup_index_upsert_replaces_entries_and_orders_by_utc_instant() {
        let mut index = BackupIndex::default();
        index.upsert(index_entry("doc-a", "2026-08-19T08:00:00Z"));
        index.upsert(index_entry("doc-b", "2026-08-19T09:00:00Z"));
        index.upsert(index_entry("doc-a", "2026-08-19T10:30:00+02:00"));

        assert_eq!(index.documents.len(), 2);
        assert_eq!(index.documents[0].document_id, "doc-b");
        assert_eq!(index.documents[1].document_id, "doc-a");
        assert_eq!(index.documents[1].latest_at, "2026-08-19T10:30:00+02:00");
    }

    #[test]
    fn backup_index_upsert_ignores_older_incoming_entry() {
        let mut index = BackupIndex::default();
        index.upsert(index_entry("doc-a", "2026-08-19T11:00:00Z"));
        index.upsert(index_entry("doc-a", "2026-08-19T10:00:00Z"));

        assert_eq!(index.documents.len(), 1);
        assert_eq!(index.documents[0].latest_at, "2026-08-19T11:00:00Z");
    }

    #[test]
    fn malformed_manifest_and_index_json_are_rejected() {
        assert!(parse_manifest(br#"{"document_id": }"#).is_err());
        assert!(parse_index(br#"{"documents": [}"#).is_err());
    }

    #[test]
    fn parse_manifest_sorts_but_preserves_legacy_rows_for_reconciliation() {
        let mut legacy = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        for index in 0..22 {
            legacy.versions.push(version(
                &format!("v{index:02}"),
                &format!("2026-08-19T12:{index:02}:00Z"),
                &format!("hash-{index}"),
                &format!("/history/v{index:02}.md"),
            ));
        }
        legacy.versions.push(version(
            "duplicate-hash",
            "2026-08-19T11:00:00Z",
            "hash-21",
            "/history/duplicate-hash.md",
        ));
        legacy.versions.push(version(
            "v20",
            "2026-08-19T10:00:00Z",
            "duplicate-id-hash",
            "/history/duplicate-id.md",
        ));
        let bytes = serde_json::to_vec(&legacy).expect("legacy manifest JSON");

        let parsed = parse_manifest(&bytes).expect("sorted legacy manifest");

        assert_eq!(parsed.versions.len(), 24);
        assert_eq!(parsed.versions[0].id, "v21");
        assert_eq!(parsed.newest_hash(), Some("hash-21"));
        assert_eq!(
            parsed
                .versions
                .iter()
                .filter(|version| version.id == "v20")
                .count(),
            2
        );
        assert_eq!(
            parsed
                .versions
                .iter()
                .filter(|version| version.sha256 == "hash-21")
                .count(),
            2
        );
    }

    #[test]
    fn next_insert_reconciles_legacy_duplicates_and_over_limit_rows_for_cleanup() {
        let mut legacy = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        for index in 0..21 {
            legacy.versions.push(version(
                &format!("v{index:02}"),
                &format!("2026-08-19T12:{index:02}:00Z"),
                &format!("hash-{index}"),
                &format!("/history/v{index:02}.md"),
            ));
        }
        legacy.versions.push(version(
            "duplicate-hash",
            "2026-08-19T11:00:00Z",
            "hash-20",
            "/history/duplicate-hash.md",
        ));
        let bytes = serde_json::to_vec(&legacy).expect("legacy manifest JSON");
        let mut parsed = parse_manifest(&bytes).expect("preserved legacy manifest");
        assert_eq!(parsed.versions.len(), 22);

        let pruned = parsed.insert_version(version(
            "v21",
            "2026-08-19T12:21:00Z",
            "hash-21",
            "/history/v21.md",
        ));
        let cleanup_paths: HashSet<_> = pruned
            .iter()
            .map(|version| version.snapshot_path.as_str())
            .collect();

        assert_eq!(parsed.versions.len(), HISTORY_LIMIT);
        assert_eq!(parsed.versions[0].id, "v21");
        assert_eq!(
            cleanup_paths,
            HashSet::from([
                "/history/duplicate-hash.md",
                "/history/v00.md",
                "/history/v01.md",
            ])
        );
    }

    #[test]
    fn parse_index_restores_sort_and_document_deduplication_invariants() {
        let legacy = BackupIndex {
            documents: vec![
                index_entry("doc-a", "2026-08-19T08:00:00Z"),
                index_entry("doc-b", "2026-08-19T09:00:00Z"),
                index_entry("doc-a", "2026-08-19T10:30:00+02:00"),
            ],
        };
        let bytes = serde_json::to_vec(&legacy).expect("legacy index JSON");

        let parsed = parse_index(&bytes).expect("normalized legacy index");

        assert_eq!(parsed.documents.len(), 2);
        assert_eq!(parsed.documents[0].document_id, "doc-b");
        assert_eq!(parsed.documents[1].document_id, "doc-a");
        assert_eq!(parsed.documents[1].latest_at, "2026-08-19T10:30:00+02:00");
    }

    #[test]
    fn parse_rejects_invalid_timestamps_with_document_context() {
        let mut manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        manifest.versions.push(version(
            "bad-version",
            "not-rfc3339",
            "hash",
            "/history/bad.md",
        ));
        let manifest_error = parse_manifest(
            &serde_json::to_vec(&manifest).expect("invalid timestamp manifest JSON"),
        )
        .expect_err("invalid manifest timestamp");

        let index = BackupIndex {
            documents: vec![index_entry("bad-document", "not-rfc3339")],
        };
        let index_error =
            parse_index(&serde_json::to_vec(&index).expect("invalid timestamp index JSON"))
                .expect_err("invalid index timestamp");

        assert!(manifest_error.contains("bad-version"));
        assert!(manifest_error.contains("timestamp"));
        assert!(index_error.contains("bad-document"));
        assert!(index_error.contains("timestamp"));
    }

    #[test]
    fn persisted_manifest_namespace_accepts_generated_layout() {
        let manifest = namespaced_manifest();

        validate_manifest_namespace(&manifest, &manifest.document_id, "/Zeditor")
            .expect("valid manifest namespace");
    }

    #[test]
    fn persisted_manifest_namespace_rejects_tampered_ids_and_hashes() {
        let valid = namespaced_manifest();

        let mut mismatched_document = valid.clone();
        mismatched_document.document_id = "d".repeat(24);
        assert!(
            validate_manifest_namespace(&mismatched_document, &valid.document_id, "/Zeditor")
                .is_err()
        );

        let mut malformed_document = valid.clone();
        malformed_document.document_id = "not-a-document-id".to_string();
        assert!(validate_manifest_namespace(
            &malformed_document,
            &malformed_document.document_id,
            "/Zeditor"
        )
        .is_err());

        let mut malformed_version = valid.clone();
        malformed_version.versions[0].id = "not-a-version-id".to_string();
        assert!(
            validate_manifest_namespace(&malformed_version, &valid.document_id, "/Zeditor")
                .is_err()
        );

        let mut malformed_hash = valid.clone();
        malformed_hash.versions[0].sha256 = "not-a-sha256".to_string();
        assert!(
            validate_manifest_namespace(&malformed_hash, &valid.document_id, "/Zeditor").is_err()
        );
    }

    #[test]
    fn persisted_manifest_namespace_rejects_tampered_current_paths() {
        let valid = namespaced_manifest();
        for current_path in [
            "/Zeditor/project/../note.md",
            "/Zeditor/note.md?download=1",
            "/Zeditor/note.md#fragment",
            "/Zeditor/.zeditor-history/documents/hidden.md",
            "/Elsewhere/note.md",
        ] {
            let mut tampered = valid.clone();
            tampered.current_path = current_path.to_string();
            assert!(
                validate_manifest_namespace(&tampered, &valid.document_id, "/Zeditor").is_err(),
                "accepted current path {current_path}"
            );
        }
    }

    #[test]
    fn persisted_manifest_namespace_rejects_tampered_snapshot_paths() {
        let valid = namespaced_manifest();
        let expected_prefix = format!(
            "/Zeditor/.zeditor-history/documents/{}/versions",
            valid.document_id
        );
        for snapshot_path in [
            format!("{expected_prefix}/../outside.md"),
            format!("{expected_prefix}/snapshot.md?download=1"),
            format!("{expected_prefix}/snapshot.md#fragment"),
            format!(
                "/Zeditor/.zeditor-history/documents/{}/versions/snapshot.md",
                "d".repeat(24)
            ),
            "/Elsewhere/snapshot.md".to_string(),
        ] {
            let mut tampered = valid.clone();
            tampered.versions[0].snapshot_path = snapshot_path.clone();
            assert!(
                validate_manifest_namespace(&tampered, &valid.document_id, "/Zeditor").is_err(),
                "accepted snapshot path {snapshot_path}"
            );
        }
    }
}
