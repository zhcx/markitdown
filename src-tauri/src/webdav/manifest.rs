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
        self.versions.sort_by(|left, right| {
            compare_rfc3339_desc(&left.created_at, &right.created_at)
                .then_with(|| right.id.cmp(&left.id))
        });

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
    // Valid timestamps are canonicalized to UTC. Invalid legacy values remain readable but sort
    // after valid timestamps, using their raw representation as a deterministic fallback.
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
    serde_json::from_slice(bytes).map_err(|error| format!("Invalid WebDAV manifest: {error}"))
}

pub fn parse_index(bytes: &[u8]) -> Result<BackupIndex, String> {
    serde_json::from_slice(bytes).map_err(|error| format!("Invalid WebDAV backup index: {error}"))
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
    fn valid_timestamps_sort_before_invalid_values_with_deterministic_fallback() {
        let mut manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        manifest.insert_version(version(
            "invalid-a",
            "not-a-time-a",
            "hash-a",
            "/history/a.md",
        ));
        manifest.insert_version(version(
            "valid",
            "2026-08-19T09:00:00Z",
            "hash-valid",
            "/history/valid.md",
        ));
        manifest.insert_version(version(
            "invalid-b",
            "not-a-time-b",
            "hash-b",
            "/history/b.md",
        ));

        assert_eq!(
            manifest
                .versions
                .iter()
                .map(|version| version.id.as_str())
                .collect::<Vec<_>>(),
            vec!["valid", "invalid-b", "invalid-a"]
        );
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
}
