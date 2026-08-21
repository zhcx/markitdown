// Temporary until Tasks 3-6 wire these domain APIs into production consumers.
#![allow(dead_code)]

mod client;
mod manager;
mod manifest;
mod model;
mod path;
mod queue;

pub use client::WebDavClient;
pub use manager::{WebDavEventSink, WebDavSyncManager};
pub use manifest::{
    parse_index, parse_manifest, validate_index_namespace, validate_manifest_namespace,
};
pub use model::{
    BackupIndex, BackupIndexEntry, DocumentManifest, PendingBackupTask, RemoteDocumentPath,
    WebDavBackupRequest, WebDavConnectionResult, WebDavDocumentRef, WebDavDocumentSummary,
    WebDavDownloadedVersion, WebDavQueuedResult, WebDavRetryResult, WebDavSettings,
    WebDavSyncEvent, WebDavVersion, HISTORY_LIMIT,
};
pub use path::{
    deterministic_version_id, map_remote_document, normalize_remote_root, sha256_hex,
    validate_endpoint,
};
pub use queue::PendingTaskStore;

#[cfg(test)]
pub(crate) mod test_support {
    /// Shared temp directory helper for WebDAV persistence tests.
    pub(crate) fn test_temp_dir() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("zeditor-webdav-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).expect("create temp directory");
        path
    }
}

#[cfg(test)]
mod tests {
    use super::{
        map_remote_document, normalize_remote_root, parse_index, validate_index_namespace,
        validate_manifest_namespace, BackupIndex, DocumentManifest, RemoteDocumentPath,
        HISTORY_LIMIT,
    };

    #[test]
    fn intended_domain_api_is_reexported_from_webdav_root() {
        assert_eq!(HISTORY_LIMIT, 20);
        assert_eq!(normalize_remote_root("Zeditor").unwrap(), "/Zeditor");
        assert!(parse_index(br#"{"documents": []}"#).is_ok());
        assert!(validate_index_namespace(&BackupIndex::default(), "/Zeditor").is_ok());
        let manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        assert!(manifest.versions.is_empty());
        let expected = RemoteDocumentPath {
            document_id: "doc".to_string(),
            display_name: "note.md".to_string(),
            current_path: "/Zeditor/note.md".to_string(),
            manifest_path: "/Zeditor/manifest.json".to_string(),
            versions_dir: "/Zeditor/versions".to_string(),
        };
        assert!(validate_manifest_namespace(&manifest, &expected, "/Zeditor").is_err());
        assert!(map_remote_document("/work/note.md", &[], "/Zeditor").is_ok());
    }
}
