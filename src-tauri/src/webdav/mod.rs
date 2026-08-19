// Temporary until Tasks 3-6 wire these domain APIs into production consumers.
#![allow(dead_code)]

mod manifest;
mod model;
mod path;

pub use manifest::{
    parse_index, parse_manifest, validate_index_namespace, validate_manifest_namespace,
};
pub use model::{
    BackupIndex, BackupIndexEntry, DocumentManifest, RemoteDocumentPath, WebDavBackupRequest,
    WebDavConnectionResult, WebDavDocumentRef, WebDavDocumentSummary, WebDavDownloadedVersion,
    WebDavQueuedResult, WebDavRetryResult, WebDavSyncEvent, WebDavVersion, HISTORY_LIMIT,
};
pub use path::{
    deterministic_version_id, map_remote_document, normalize_remote_root, sha256_hex,
    validate_endpoint,
};

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
