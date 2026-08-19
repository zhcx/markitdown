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
        self.versions
            .retain(|existing| existing.id != version.id && existing.sha256 != version.sha256);
        self.versions.push(version);
        self.versions.sort_by(|left, right| {
            right
                .created_at
                .cmp(&left.created_at)
                .then_with(|| right.id.cmp(&left.id))
        });

        if self.versions.len() <= HISTORY_LIMIT {
            Vec::new()
        } else {
            self.versions.split_off(HISTORY_LIMIT)
        }
    }
}

impl BackupIndex {
    pub fn upsert(&mut self, entry: BackupIndexEntry) {
        self.documents
            .retain(|existing| existing.document_id != entry.document_id);
        self.documents.push(entry);
        self.documents.sort_by(|left, right| {
            right
                .latest_at
                .cmp(&left.latest_at)
                .then_with(|| left.document_id.cmp(&right.document_id))
        });
    }
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

    #[test]
    fn document_manifest_deduplicates_and_keeps_twenty_newest_versions() {
        let mut manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/notes/note.md");

        for index in 0..21 {
            manifest.insert_version(WebDavVersion {
                id: format!("v{index:02}"),
                created_at: format!("2026-08-19T12:{index:02}:00Z"),
                size: index,
                sha256: format!("hash-{index}"),
                snapshot_path: format!("/history/v{index:02}.md"),
            });
        }

        let duplicate = manifest.versions[0].clone();
        manifest.insert_version(duplicate.clone());

        assert_eq!(manifest.versions.len(), 20);
        assert_eq!(manifest.versions[0].id, "v20");
        assert_eq!(
            manifest
                .versions
                .iter()
                .filter(|version| version.sha256 == duplicate.sha256)
                .count(),
            1
        );
    }
}
