// Temporary until Tasks 3-6 wire these domain APIs into production consumers.
#![allow(dead_code)]

mod manifest;
mod model;
mod path;

pub use manifest::{parse_index, parse_manifest};
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
        map_remote_document, normalize_remote_root, parse_index, DocumentManifest, HISTORY_LIMIT,
    };

    #[test]
    fn intended_domain_api_is_reexported_from_webdav_root() {
        assert_eq!(HISTORY_LIMIT, 20);
        assert_eq!(normalize_remote_root("Zeditor").unwrap(), "/Zeditor");
        assert!(parse_index(br#"{"documents": []}"#).is_ok());
        let manifest = DocumentManifest::new("doc", "note.md", "/Zeditor/note.md");
        assert!(manifest.versions.is_empty());
        assert!(map_remote_document("/work/note.md", &[], "/Zeditor").is_ok());
    }
}
