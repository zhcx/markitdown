use std::{cmp::Ordering, collections::HashSet};

use chrono::{DateTime, Utc};

use super::model::{BackupIndex, BackupIndexEntry, DocumentManifest, WebDavVersion, HISTORY_LIMIT};

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
        let mut pruned = Vec::new();
        self.versions.retain(|existing| {
            let is_duplicate = existing.id == version.id || existing.sha256 == version.sha256;
            if is_duplicate {
                pruned.push(existing.clone());
            }
            !is_duplicate
        });
        self.versions.push(version);
        sort_versions(&mut self.versions);

        if self.versions.len() > HISTORY_LIMIT {
            pruned.extend(self.versions.split_off(HISTORY_LIMIT));
        }

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
        self.documents
            .retain(|existing| existing.document_id != entry.document_id);
        self.documents.push(entry);
        self.documents.sort_by(|left, right| {
            compare_rfc3339_desc(&left.latest_at, &right.latest_at)
                .then_with(|| left.document_id.cmp(&right.document_id))
        });
    }
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
    let mut document_ids = HashSet::new();
    let mut content_hashes = HashSet::new();
    manifest.versions.retain(|version| {
        if document_ids.contains(&version.id) || content_hashes.contains(&version.sha256) {
            false
        } else {
            document_ids.insert(version.id.clone());
            content_hashes.insert(version.sha256.clone());
            true
        }
    });
    manifest.versions.truncate(HISTORY_LIMIT);

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

    index.documents.sort_by(|left, right| {
        compare_rfc3339_desc(&left.latest_at, &right.latest_at)
            .then_with(|| left.document_id.cmp(&right.document_id))
    });
    let mut document_ids = HashSet::new();
    index
        .documents
        .retain(|entry| document_ids.insert(entry.document_id.clone()));

    Ok(index)
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
    fn malformed_manifest_and_index_json_are_rejected() {
        assert!(parse_manifest(br#"{"document_id": }"#).is_err());
        assert!(parse_index(br#"{"documents": [}"#).is_err());
    }

    #[test]
    fn parse_manifest_restores_sort_deduplication_and_retention_invariants() {
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

        let parsed = parse_manifest(&bytes).expect("normalized legacy manifest");

        assert_eq!(parsed.versions.len(), HISTORY_LIMIT);
        assert_eq!(parsed.versions[0].id, "v21");
        assert_eq!(parsed.newest_hash(), Some("hash-21"));
        assert_eq!(
            parsed
                .versions
                .iter()
                .filter(|version| version.id == "v20")
                .count(),
            1
        );
        assert_eq!(
            parsed
                .versions
                .iter()
                .filter(|version| version.sha256 == "hash-21")
                .count(),
            1
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
}
