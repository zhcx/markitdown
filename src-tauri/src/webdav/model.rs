use serde::{Deserialize, Serialize};

pub const HISTORY_LIMIT: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteDocumentPath {
    pub document_id: String,
    pub display_name: String,
    pub current_path: String,
    pub manifest_path: String,
    pub versions_dir: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebDavVersion {
    pub id: String,
    pub created_at: String,
    pub size: u64,
    pub sha256: String,
    pub snapshot_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocumentManifest {
    pub document_id: String,
    pub display_name: String,
    pub current_path: String,
    pub versions: Vec<WebDavVersion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupIndexEntry {
    pub document_id: String,
    pub display_name: String,
    pub current_path: String,
    pub manifest_path: String,
    pub latest_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupIndex {
    pub documents: Vec<BackupIndexEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebDavBackupRequest {
    pub local_path: String,
    pub workspace_roots: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebDavDocumentRef {
    pub document_id: String,
    pub display_name: String,
    pub local_path: String,
    pub current_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebDavConnectionResult {
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebDavQueuedResult {
    pub document: WebDavDocumentRef,
    pub queued_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebDavRetryResult {
    pub retried: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebDavDocumentSummary {
    pub document_id: String,
    pub display_name: String,
    pub current_path: String,
    pub latest_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebDavDownloadedVersion {
    pub filename: String,
    pub content: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebDavSyncEvent {
    pub document_id: String,
    pub local_path: String,
    pub phase: String,
    pub progress: Option<String>,
    pub timestamp: String,
    pub error: Option<String>,
}
