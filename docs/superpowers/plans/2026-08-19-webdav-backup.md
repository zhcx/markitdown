# WebDAV Document Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop-only one-way WebDAV backup with asynchronous save-triggered uploads, portable 20-version history, persistent retry, Settings configuration, status-bar state, and verified Save As downloads.

**Architecture:** Rust owns WebDAV protocol, remote manifests, path safety, and the durable globally serialized queue. A focused frontend Zustand store consumes Tauri status events and history commands, while `appStore.saveTab` only enqueues after a successful local write. Settings and status/history UI consume the shared settings and WebDAV store without coupling network failures to local save success.

**Tech Stack:** React 18, TypeScript 5.9, Zustand 4, Tauri 2, Rust 2021, Tokio, reqwest 0.12, serde/serde_json, SHA-256, Node test runner, Rust unit/integration tests.

---

## File Structure

### New files

- `src-tauri/src/webdav/mod.rs` — public Tauri command surface and shared exports.
- `src-tauri/src/webdav/model.rs` — settings, requests, manifests, events, and response DTOs.
- `src-tauri/src/webdav/path.rs` — endpoint validation, segment encoding, document identity, and remote layout.
- `src-tauri/src/webdav/client.rs` — authenticated WebDAV HTTP methods and sanitized errors.
- `src-tauri/src/webdav/manifest.rs` — history/index parsing, deduplication, and retention.
- `src-tauri/src/webdav/queue.rs` — atomic pending-task persistence and task coalescing.
- `src-tauri/src/webdav/manager.rs` — serialized background worker, transaction orchestration, retries, and events.
- `src/types/webdav.ts` — frontend command/event/status contracts.
- `src/stores/webdavStore.ts` — event lifecycle, status, history loading, retry, and download state.
- `src/utils/webdavState.ts` — pure event-to-state reducer and status-label helpers.
- `src/components/WebDav/WebDavSettings.tsx` — settings fields, connection test, and global browser entry.
- `src/components/WebDav/WebDavHistoryDialog.tsx` — global/current document history and Save As actions.
- `src/components/WebDav/WebDavStatusItem.tsx` — status-bar item and current-document popover.
- `tests/webdavSettings.test.ts` — settings migration and UI contract tests.
- `tests/webdavIntegration.test.ts` — save enqueue, status reducer, startup retry, and download isolation tests.

### Modified files

- `src-tauri/src/commands.rs` — add defaulted WebDAV settings to persisted application settings.
- `src-tauri/src/main.rs` — register commands and manage `WebDavSyncManager`.
- `src/stores/appStore.ts` — add frontend settings defaults/migration and enqueue after local saves.
- `src/App.tsx` — initialize the WebDAV listener and retry durable pending work after settings load.
- `src/components/Settings/SettingsPanel.tsx` — add the `webdav` navigation tab and settings component.
- `src/components/StatusBar/StatusBar.tsx` — render `WebDavStatusItem` and history dialog.
- `src/styles/main.css` — WebDAV settings, status, popover, and history dialog styling.
- `src/styles/workbench.css` — compact status-bar integration and responsive dialog refinements.
- `src-tauri/Cargo.toml` — no production dependency change; reqwest, Tokio, serde, SHA-256, and URL encoding already exist.
- `src-tauri/Cargo.lock` — regenerate only if Cargo changes lock metadata.
- `README.md`, `CHANGELOG.md`, `docs/releases/v0.3.8.md` — document backup behavior and privacy/storage implications.

## Task 1: Add Backward-Compatible WebDAV Settings

**Files:**
- Modify: `src-tauri/src/commands.rs:73-314`
- Modify: `src/stores/appStore.ts:27-376`
- Create: `tests/webdavSettings.test.ts`

- [ ] **Step 1: Write the failing frontend settings migration test**

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('WebDAV settings have safe defaults in frontend and Rust persistence', () => {
  const frontend = read('src/stores/appStore.ts');
  const rust = read('src-tauri/src/commands.rs');

  for (const field of ['enabled', 'server_url', 'username', 'password', 'remote_root']) {
    assert.match(frontend, new RegExp(`${field}:`));
    assert.match(rust, new RegExp(`pub ${field}:`));
  }
  assert.match(frontend, /webdav:\s*\{[\s\S]*remote_root:\s*['"]\/Zeditor['"]/);
  assert.match(frontend, /webdav:\s*\{\s*\.\.\.defaultSettings\.webdav,\s*\.\.\.saved\.webdav/);
  assert.match(rust, /#\[serde\(default\)\]\s*pub webdav: WebDavSettings/);
});
```

- [ ] **Step 2: Run the settings test and verify RED**

Run: `node --test tests/webdavSettings.test.ts`

Expected: FAIL because neither settings model contains `webdav`.

- [ ] **Step 3: Add the Rust settings model and defaults**

Add to `src-tauri/src/commands.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub server_url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default = "default_webdav_remote_root")]
    pub remote_root: String,
}

fn default_webdav_remote_root() -> String {
    "/Zeditor".into()
}

impl Default for WebDavSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            server_url: String::new(),
            username: String::new(),
            password: String::new(),
            remote_root: default_webdav_remote_root(),
        }
    }
}
```

Add this field to `Settings` and its default:

```rust
#[serde(default)]
pub webdav: WebDavSettings,
```

```rust
webdav: WebDavSettings::default(),
```

- [ ] **Step 4: Add TypeScript settings defaults and normalization**

Add to `Settings`:

```ts
webdav: {
  enabled: boolean;
  server_url: string;
  username: string;
  password: string;
  remote_root: string;
};
```

Add to `defaultSettings`:

```ts
webdav: {
  enabled: false,
  server_url: '',
  username: '',
  password: '',
  remote_root: '/Zeditor',
},
```

Add to `normalizeSettings`:

```ts
webdav: { ...defaultSettings.webdav, ...saved.webdav },
```

- [ ] **Step 5: Run settings and existing tests and verify GREEN**

Run: `node --test tests/webdavSettings.test.ts tests/appearanceSettings.test.ts tests/agentSupport.test.ts`

Expected: PASS.

- [ ] **Step 6: Verify Rust settings compatibility**

Add this Rust unit test in `commands.rs`:

```rust
#[test]
fn settings_without_webdav_use_defaults() {
    let mut value = serde_json::to_value(Settings::default()).expect("serialize defaults");
    value.as_object_mut().expect("settings object").remove("webdav");
    let settings: Settings = serde_json::from_value(value).expect("deserialize legacy settings");
    assert!(!settings.webdav.enabled);
    assert_eq!(settings.webdav.remote_root, "/Zeditor");
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings_without_webdav_use_defaults`.

- [ ] **Step 7: Commit the settings schema**

```bash
git add src-tauri/src/commands.rs src/stores/appStore.ts tests/webdavSettings.test.ts
git commit -m "feat: add WebDAV settings schema"
```

## Task 2: Implement Safe Remote Paths and History Models

**Files:**
- Create: `src-tauri/src/webdav/model.rs`
- Create: `src-tauri/src/webdav/path.rs`
- Create: `src-tauri/src/webdav/manifest.rs`
- Create: `src-tauri/src/webdav/mod.rs`
- Modify: `src-tauri/src/main.rs:1-20`

- [ ] **Step 1: Write failing Rust tests for validation and mapping**

Place tests in `path.rs` and `manifest.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_credentials_and_traversal() {
        assert!(validate_endpoint("https://user:secret@example.com/dav").is_err());
        assert!(normalize_remote_root("/Zeditor/../private").is_err());
        assert!(normalize_remote_root("/Zeditor?x=1").is_err());
    }

    #[test]
    fn maps_workspace_and_standalone_documents_without_exposing_parent_paths() {
        let workspace = map_remote_document(
            "C:\\notes\\docs\\note.md",
            &["C:\\notes".into()],
            "/Zeditor",
        ).expect("workspace mapping");
        assert_eq!(workspace.current_path, "/Zeditor/notes/docs/note.md");

        let standalone = map_remote_document(
            "C:\\private\\note.md",
            &[],
            "/Zeditor",
        ).expect("standalone mapping");
        assert!(standalone.current_path.starts_with("/Zeditor/Standalone/"));
        assert!(!standalone.current_path.contains("private"));
    }
}
```

```rust
#[test]
fn deduplicates_and_keeps_twenty_newest_versions() {
    let mut manifest = DocumentManifest::new("doc", "/Zeditor/notes/note.md");
    for index in 0..21 {
        manifest.insert_version(WebDavVersion {
            id: format!("v{index:02}"),
            created_at: format!("2026-08-19T12:{index:02}:00Z"),
            size: index,
            sha256: format!("hash-{index}"),
            snapshot_path: format!("/history/v{index:02}.md"),
        });
    }
    manifest.insert_version(manifest.versions[0].clone());
    assert_eq!(manifest.versions.len(), 20);
    assert_eq!(manifest.versions[0].id, "v20");
}
```

- [ ] **Step 2: Run the focused Rust tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml webdav::`

Expected: FAIL because the WebDAV module and types do not exist.

- [ ] **Step 3: Add WebDAV DTOs**

Define in `model.rs` with `Serialize`, `Deserialize`, `Clone`, and `Debug` as appropriate:

```rust
pub const HISTORY_LIMIT: usize = 20;

pub struct RemoteDocumentPath {
    pub document_id: String,
    pub display_name: String,
    pub current_path: String,
    pub manifest_path: String,
    pub versions_dir: String,
}

pub struct WebDavVersion {
    pub id: String,
    pub created_at: String,
    pub size: u64,
    pub sha256: String,
    pub snapshot_path: String,
}

pub struct DocumentManifest {
    pub document_id: String,
    pub display_name: String,
    pub current_path: String,
    pub versions: Vec<WebDavVersion>,
}

pub struct BackupIndexEntry {
    pub document_id: String,
    pub display_name: String,
    pub current_path: String,
    pub manifest_path: String,
    pub latest_at: String,
}

pub struct BackupIndex {
    pub documents: Vec<BackupIndexEntry>,
}
```

Also define the command request/response and event types exactly as named in the design: `WebDavBackupRequest`, `WebDavDocumentRef`, `WebDavConnectionResult`, `WebDavQueuedResult`, `WebDavRetryResult`, `WebDavDocumentSummary`, `WebDavDownloadedVersion`, and `WebDavSyncEvent`.

- [ ] **Step 4: Implement path validation and identity**

In `path.rs`, use `reqwest::Url`, `sha2::{Digest, Sha256}`, and percent-encode each generated segment with `urlencoding::encode`. Implement:

```rust
pub fn validate_endpoint(raw: &str) -> Result<Url, String>;
pub fn normalize_remote_root(raw: &str) -> Result<String, String>;
pub fn map_remote_document(
    local_path: &str,
    workspace_roots: &[String],
    remote_root: &str,
) -> Result<RemoteDocumentPath, String>;
pub fn sha256_hex(bytes: &[u8]) -> String;
pub fn deterministic_version_id(created_at: &str, sha256: &str) -> String;
```

Select the longest workspace root that contains the file. Sanitize the workspace directory name, preserve relative segments, and use the first 24 hex characters of the identity digest for document IDs.

- [ ] **Step 5: Implement manifest/index operations**

In `manifest.rs`, implement:

```rust
impl DocumentManifest {
    pub fn new(document_id: &str, display_name: &str, current_path: &str) -> Self;
    pub fn newest_hash(&self) -> Option<&str>;
    pub fn insert_version(&mut self, version: WebDavVersion) -> Vec<WebDavVersion>;
}

impl BackupIndex {
    pub fn upsert(&mut self, entry: BackupIndexEntry);
}

pub fn parse_manifest(bytes: &[u8]) -> Result<DocumentManifest, String>;
pub fn parse_index(bytes: &[u8]) -> Result<BackupIndex, String>;
```

`insert_version` removes an existing entry with the same ID or SHA-256, sorts newest first, returns pruned entries, and truncates to `HISTORY_LIMIT`.

- [ ] **Step 6: Export the module and run tests**

Add `mod webdav;` to `main.rs`. Run: `cargo fmt --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml webdav::`.

Expected: PASS.

- [ ] **Step 7: Commit domain models and paths**

```bash
git add src-tauri/src/webdav src-tauri/src/main.rs
git commit -m "feat: model WebDAV backup history"
```

## Task 3: Build the Authenticated WebDAV Client

**Files:**
- Create: `src-tauri/src/webdav/client.rs`
- Modify: `src-tauri/src/webdav/mod.rs`

- [ ] **Step 1: Write a failing in-process protocol test**

In `client.rs`, create a `#[cfg(test)] pub(crate) mod test_support` containing this explicit fixture contract:

```rust
#[derive(Clone, Debug)]
pub(crate) struct RecordedRequest {
    pub method: String,
    pub path: String,
    pub authorization: String,
    pub depth: String,
    pub body: Vec<u8>,
}

pub(crate) struct TestDavServer {
    pub url: String,
    requests: Arc<tokio::sync::Mutex<Vec<RecordedRequest>>>,
    resources: Arc<tokio::sync::Mutex<HashMap<String, Vec<u8>>>>,
    statuses: Arc<tokio::sync::Mutex<VecDeque<u16>>>,
    fail_once_path: Arc<tokio::sync::Mutex<Option<String>>>,
}

impl TestDavServer {
    pub async fn start(statuses: Vec<u16>) -> Self;
    pub async fn success() -> Self;
    pub async fn fail_once_on_current() -> Self;
    pub async fn with_resources(resources: HashMap<String, Vec<u8>>) -> Self;
    pub async fn requests(&self) -> Vec<RecordedRequest>;
    pub async fn put_paths(&self) -> Vec<String>;
    pub async fn resource(&self, path: &str) -> Option<Vec<u8>>;
    pub async fn visible_manifest_versions(&self) -> usize;
}

pub(crate) fn settings_for(url: &str) -> WebDavSettings {
    WebDavSettings {
        enabled: true,
        server_url: url.into(),
        username: "user".into(),
        password: "secret".into(),
        remote_root: "/Zeditor".into(),
    }
}
```

Implement the fixture with `tokio::net::TcpListener`: read headers through `\r\n\r\n`, then read exactly `Content-Length` bytes; record the request; use queued statuses when present; otherwise return `201` for `MKCOL`, store bytes and return `204` for `PUT`, return stored bytes or `404` for `GET`, return `207` for `PROPFIND`, and remove bytes with `204` for `DELETE`. `fail_once_on_current` returns `503` once for `/Zeditor/notes/note.md`. `visible_manifest_versions` parses the stored document manifest and returns its version count.

Add tests for:

```rust
#[tokio::test]
async fn creates_collections_and_uploads_with_basic_auth() {
    let server = TestDavServer::start(vec![201, 201, 204]).await;
    let client = WebDavClient::new(settings_for(&server.url)).expect("client");
    client.ensure_collection("/Zeditor/docs").await.expect("collections");
    client.put("/Zeditor/docs/note.md", b"hello").await.expect("put");
    let requests = server.requests().await;
    assert_eq!(requests.iter().map(|r| r.method.as_str()).collect::<Vec<_>>(), ["MKCOL", "MKCOL", "PUT"]);
    assert!(requests.iter().all(|r| r.authorization.starts_with("Basic ")));
}

#[tokio::test]
async fn sanitizes_authentication_errors() {
    let server = TestDavServer::start(vec![401]).await;
    let settings = settings_for(&server.url);
    let client = WebDavClient::new(settings.clone()).expect("client");
    let error = client.get("/Zeditor/private.md").await.expect_err("401");
    assert!(error.contains("认证"));
    assert!(!error.contains(&settings.password));
}
```

- [ ] **Step 2: Run protocol tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml webdav::client::tests -- --nocapture`

Expected: FAIL because `WebDavClient` does not exist.

- [ ] **Step 3: Implement `WebDavClient`**

Implement this public API:

```rust
pub struct WebDavClient {
    client: reqwest::Client,
    endpoint: reqwest::Url,
    username: String,
    password: String,
}

impl WebDavClient {
    pub fn new(settings: WebDavSettings) -> Result<Self, String>;
    pub async fn ensure_collection(&self, path: &str) -> Result<(), String>;
    pub async fn put(&self, path: &str, bytes: &[u8]) -> Result<(), String>;
    pub async fn get_optional(&self, path: &str) -> Result<Option<Vec<u8>>, String>;
    pub async fn get(&self, path: &str) -> Result<Vec<u8>, String>;
    pub async fn delete_optional(&self, path: &str) -> Result<(), String>;
    pub async fn propfind_exists(&self, path: &str) -> Result<bool, String>;
    pub async fn test_connection(&self, remote_root: &str) -> Result<(), String>;
}
```

Build the client with a 10-second connect timeout and 45-second total timeout. Apply `basic_auth` only when username is non-empty. Treat `200`, `201`, and `204` as PUT success; `201`, `405`, and existing-collection `301` as acceptable collection outcomes; `404` as optional GET/DELETE absence; and `207` as PROPFIND success. Cap sanitized server diagnostics at 240 characters.

- [ ] **Step 4: Implement write-capable connection testing**

`test_connection` creates the root, writes `.zeditor-probe-<uuid>.txt`, reads it back, compares bytes to `b"zeditor-webdav-test"`, and attempts deletion in a final cleanup path before returning.

- [ ] **Step 5: Run client tests and verify GREEN**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml webdav::client::tests -- --nocapture`.

Expected: PASS with no external network access.

- [ ] **Step 6: Commit the protocol client**

```bash
git add src-tauri/src/webdav/client.rs src-tauri/src/webdav/mod.rs
git commit -m "feat: add WebDAV protocol client"
```

## Task 4: Add Durable Pending Tasks and Coalescing

**Files:**
- Create: `src-tauri/src/webdav/queue.rs`
- Modify: `src-tauri/src/webdav/model.rs`

- [ ] **Step 1: Write failing queue persistence tests**

```rust
#[test]
fn coalesces_document_tasks_and_round_trips_atomically() {
    let root = test_temp_dir();
    let store = PendingTaskStore::new(root.join("webdav-pending.json"));
    store.upsert(task("doc-a", "hash-1", "v1")).expect("first");
    store.upsert(task("doc-a", "hash-2", "v2")).expect("replace");
    store.upsert(task("doc-b", "hash-3", "v3")).expect("second doc");
    let tasks = store.load().expect("load");
    assert_eq!(tasks.len(), 2);
    assert_eq!(tasks.iter().find(|t| t.document_id == "doc-a").unwrap().sha256, "hash-2");
}

fn test_temp_dir() -> PathBuf {
    let path = std::env::temp_dir().join(format!("zeditor-webdav-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&path).expect("create temp directory");
    path
}

fn task(document_id: &str, sha256: &str, version_id: &str) -> PendingBackupTask {
    PendingBackupTask {
        document_id: document_id.into(),
        display_name: "note.md".into(),
        local_path: "C:\\notes\\note.md".into(),
        workspace_roots: vec!["C:\\notes".into()],
        current_path: "/Zeditor/notes/note.md".into(),
        manifest_path: format!("/Zeditor/.zeditor-history/documents/{document_id}/manifest.json"),
        versions_dir: format!("/Zeditor/.zeditor-history/documents/{document_id}/versions"),
        queued_at: "2026-08-19T14:32:00Z".into(),
        sha256: sha256.into(),
        version_id: version_id.into(),
    }
}

#[test]
fn updates_stale_hash_before_network_execution() {
    let mut task = task("doc-a", "old", "old-version");
    task.refresh_for_bytes(b"new bytes", "2026-08-19T14:32:00Z");
    assert_eq!(task.sha256, sha256_hex(b"new bytes"));
    assert_ne!(task.version_id, "old-version");
}
```

- [ ] **Step 2: Run queue tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml webdav::queue::tests`

Expected: FAIL because queue types are absent.

- [ ] **Step 3: Implement pending-task persistence**

Define `PendingBackupTask` with document ID, local path, workspace roots, remote paths, queued UTC timestamp, SHA-256, version ID, and display name. Implement:

```rust
pub struct PendingTaskStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl PendingTaskStore {
    pub fn new(path: PathBuf) -> Self;
    pub fn load(&self) -> Result<Vec<PendingBackupTask>, String>;
    pub fn upsert(&self, task: PendingBackupTask) -> Result<(), String>;
    pub fn remove(&self, document_id: &str) -> Result<(), String>;
}
```

Write JSON to a sibling temporary file, flush it, then rename over the destination while holding the lock. Never persist settings or document bytes.

- [ ] **Step 4: Run queue tests and verify GREEN**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml webdav::queue::tests`.

Expected: PASS.

- [ ] **Step 5: Commit durable queue support**

```bash
git add src-tauri/src/webdav/model.rs src-tauri/src/webdav/queue.rs
git commit -m "feat: persist WebDAV backup queue"
```

## Task 5: Implement the Serialized Synchronization Manager

**Files:**
- Create: `src-tauri/src/webdav/manager.rs`
- Modify: `src-tauri/src/webdav/mod.rs`
- Modify: `src-tauri/src/webdav/model.rs`

- [ ] **Step 1: Write failing transaction-order and retry tests**

Use the local fixture from Task 3 and assert:

```rust
fn task_for(path: &Path, bytes: &[u8]) -> PendingBackupTask {
    std::fs::write(path, bytes).expect("write local fixture");
    PendingBackupTask {
        document_id: "doc-a".into(),
        display_name: "note.md".into(),
        local_path: path.to_string_lossy().into_owned(),
        workspace_roots: vec![path.parent().unwrap().to_string_lossy().into_owned()],
        current_path: "/Zeditor/notes/note.md".into(),
        manifest_path: "/Zeditor/.zeditor-history/documents/doc-a/manifest.json".into(),
        versions_dir: "/Zeditor/.zeditor-history/documents/doc-a/versions".into(),
        queued_at: "2026-08-19T14:32:00Z".into(),
        sha256: sha256_hex(bytes),
        version_id: deterministic_version_id("2026-08-19T14:32:00Z", &sha256_hex(bytes)),
    }
}

#[derive(Default)]
struct RecordingEventSink {
    events: Mutex<Vec<WebDavSyncEvent>>,
}

impl WebDavEventSink for RecordingEventSink {
    fn emit(&self, event: &WebDavSyncEvent) -> Result<(), String> {
        self.events.lock().expect("event lock").push(event.clone());
        Ok(())
    }
}

fn manager_for(queue_path: PathBuf) -> WebDavSyncManager {
    WebDavSyncManager::new(queue_path, Arc::new(RecordingEventSink::default()))
}

#[tokio::test]
async fn uploads_snapshot_manifest_index_then_current() {
    let fixture = TestDavServer::success().await;
    let root = test_temp_dir();
    let manager = manager_for(root.join("pending.json"));
    let task = task_for(&root.join("note.md"), b"version one");
    manager.process(task, settings_for(&fixture.url)).await.expect("sync");
    assert_eq!(fixture.put_paths().await, vec![
        "/Zeditor/.zeditor-history/documents/doc-a/versions/v1.md",
        "/Zeditor/.zeditor-history/documents/doc-a/manifest.json",
        "/Zeditor/.zeditor-history/index.json",
        "/Zeditor/notes/note.md",
    ]);
}

#[tokio::test]
async fn retry_after_current_copy_failure_does_not_duplicate_history() {
    let fixture = TestDavServer::fail_once_on_current().await;
    let root = test_temp_dir();
    let manager = manager_for(root.join("pending.json"));
    let task = task_for(&root.join("note.md"), b"version one");
    assert!(manager.process(task.clone(), settings_for(&fixture.url)).await.is_err());
    manager.process(task, settings_for(&fixture.url)).await.expect("retry");
    assert_eq!(fixture.visible_manifest_versions().await, 1);
}
```

Move `test_temp_dir` to `webdav::test_support` so queue and manager tests share one defined helper.

- [ ] **Step 2: Run manager tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml webdav::manager::tests -- --nocapture`

Expected: FAIL because the manager is absent.

- [ ] **Step 3: Implement manager state and public methods**

```rust
#[derive(Clone)]
pub struct WebDavSyncManager {
    inner: Arc<WebDavSyncInner>,
}

struct WebDavSyncInner {
    queue: PendingTaskStore,
    worker: tokio::sync::Mutex<()>,
    events: Arc<dyn WebDavEventSink>,
}

pub trait WebDavEventSink: Send + Sync {
    fn emit(&self, event: &WebDavSyncEvent) -> Result<(), String>;
}

impl WebDavSyncManager {
    pub fn new(queue_path: PathBuf, events: Arc<dyn WebDavEventSink>) -> Self;
    pub async fn enqueue(&self, request: WebDavBackupRequest, settings: WebDavSettings) -> Result<WebDavQueuedResult, String>;
    pub async fn retry_pending(&self, settings: WebDavSettings) -> Result<WebDavRetryResult, String>;
    pub async fn process(&self, task: PendingBackupTask, settings: WebDavSettings) -> Result<(), String>;
}
```

`enqueue` maps the local path, hashes current bytes, persists before spawning work, emits `queued`, clones the manager, and starts `process` with `tauri::async_runtime::spawn`. The command therefore returns after durable queue persistence. `process` holds the global async mutex through manifest/index/current updates, refreshes stale task metadata before network calls, emits `syncing`, removes the task only on success, and emits sanitized `success` or `error` events.

Add `TauriWebDavEventSink(AppHandle)` in `webdav/mod.rs`; its trait implementation emits `webdav-sync-status` through `AppHandle::emit`.

- [ ] **Step 4: Implement manifest, index, current-copy, and cleanup transaction**

Use `get_optional` for manifest/index, `serde_json::to_vec_pretty` for writes, `insert_version` for dedupe/retention, and `delete_optional` for pruned snapshots after the current copy succeeds. If the newest manifest hash already matches, do not create a second version; still PUT the current copy.

- [ ] **Step 5: Run manager and all WebDAV Rust tests**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml webdav:: -- --nocapture`.

Expected: PASS.

- [ ] **Step 6: Commit the manager transaction**

```bash
git add src-tauri/src/webdav
git commit -m "feat: synchronize WebDAV backups"
```

## Task 6: Expose Tauri Commands, Events, Listing, and Verified Download

**Files:**
- Modify: `src-tauri/src/webdav/mod.rs`
- Modify: `src-tauri/src/webdav/manager.rs`
- Modify: `src-tauri/src/main.rs:1-225`

- [ ] **Step 1: Write failing command-level Rust tests**

Add command-level tests using `TestDavServer::with_resources`. The hash mismatch case must be explicit:

```rust
#[tokio::test]
async fn download_rejects_manifest_hash_mismatch() {
    let snapshot_path = "/Zeditor/.zeditor-history/documents/doc-a/versions/v1.md";
    let manifest = DocumentManifest {
        document_id: "doc-a".into(),
        display_name: "note.md".into(),
        current_path: "/Zeditor/notes/note.md".into(),
        versions: vec![WebDavVersion {
            id: "v1".into(),
            created_at: "2026-08-19T14:32:00Z".into(),
            size: 7,
            sha256: sha256_hex(b"expected"),
            snapshot_path: snapshot_path.into(),
        }],
    };
    let mut resources = HashMap::new();
    resources.insert(
        "/Zeditor/.zeditor-history/documents/doc-a/manifest.json".into(),
        serde_json::to_vec(&manifest).expect("manifest json"),
    );
    resources.insert(snapshot_path.into(), b"tampered".to_vec());
    let server = TestDavServer::with_resources(resources).await;
    let error = webdav_download_version("doc-a".into(), "v1".into(), settings_for(&server.url))
        .await
        .expect_err("hash mismatch");
    assert!(error.contains("校验失败"));
}
```

Add companion tests that seed `index.json` and `manifest.json`, then assert `list_documents` and `list_versions` return the seeded rows, plus a successful download that returns UTF-8 content and the expected hash.

- [ ] **Step 2: Run command tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml webdav::command_tests`

Expected: FAIL because command functions are not exported.

- [ ] **Step 3: Implement the command surface**

In `webdav/mod.rs`, add `#[tauri::command]` functions with these exact names:

```rust
pub async fn webdav_test_connection(settings: WebDavSettings) -> Result<WebDavConnectionResult, String>;
pub async fn webdav_enqueue_backup(manager: State<'_, WebDavSyncManager>, request: WebDavBackupRequest, settings: WebDavSettings) -> Result<WebDavQueuedResult, String>;
pub async fn webdav_retry_pending(manager: State<'_, WebDavSyncManager>, settings: WebDavSettings) -> Result<WebDavRetryResult, String>;
pub async fn webdav_list_documents(settings: WebDavSettings) -> Result<Vec<WebDavDocumentSummary>, String>;
pub async fn webdav_list_versions(document_id: String, settings: WebDavSettings) -> Result<Vec<WebDavVersion>, String>;
pub async fn webdav_download_version(document_id: String, version_id: String, settings: WebDavSettings) -> Result<WebDavDownloadedVersion, String>;
```

`WebDavDownloadedVersion` contains filename, UTF-8 content, byte size, and SHA-256. The download command verifies the bytes before returning.

- [ ] **Step 4: Register state and commands in `main.rs`**

In setup, derive `webdav-pending.json` from `app_data_dir()` and manage `WebDavSyncManager::new(queue_path, Arc::new(TauriWebDavEventSink(app.handle().clone())))`. Add all six commands to `generate_handler!`.

- [ ] **Step 5: Run Rust tests, format, and Clippy**

Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Tauri integration**

```bash
git add src-tauri/src/main.rs src-tauri/src/webdav
git commit -m "feat: expose WebDAV backup commands"
```

## Task 7: Add Frontend WebDAV State and Event Lifecycle

**Files:**
- Create: `src/types/webdav.ts`
- Create: `src/utils/webdavState.ts`
- Create: `src/stores/webdavStore.ts`
- Create: `tests/webdavIntegration.test.ts`

- [ ] **Step 1: Write failing pure state tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { reduceWebDavStatus } from '../src/utils/webdavState.ts';

test('maps queued syncing success and error events to status-bar state', () => {
  const queued = reduceWebDavStatus(undefined, { document_id: 'a', local_path: 'note.md', phase: 'queued', timestamp: '2026-08-19T14:00:00Z' });
  assert.equal(queued.phase, 'queued');
  const syncing = reduceWebDavStatus(queued, { document_id: 'a', local_path: 'note.md', phase: 'syncing', timestamp: '2026-08-19T14:00:01Z' });
  assert.equal(syncing.phase, 'syncing');
  const success = reduceWebDavStatus(syncing, { document_id: 'a', local_path: 'note.md', phase: 'success', timestamp: '2026-08-19T14:00:02Z' });
  assert.equal(success.last_success_at, '2026-08-19T14:00:02Z');
});

test('ignores a stale event from a different document when selecting current status', () => {
  const current = { document_id: 'current', phase: 'idle' as const, error: '', last_success_at: '' };
  const next = reduceWebDavStatus(current, { document_id: 'other', local_path: 'other.md', phase: 'error', timestamp: '2026-08-19T14:00:00Z', error: 'offline' });
  assert.equal(next.document_id, 'current');
});
```

- [ ] **Step 2: Run frontend WebDAV tests and verify RED**

Run: `node --test tests/webdavIntegration.test.ts`

Expected: FAIL because frontend WebDAV types and reducer are absent.

- [ ] **Step 3: Define frontend contracts**

In `src/types/webdav.ts`, mirror all snake_case Rust DTOs and define:

```ts
export type WebDavSyncPhase = 'disabled' | 'idle' | 'queued' | 'syncing' | 'success' | 'error';

export interface WebDavSyncEvent {
  document_id: string;
  local_path: string;
  phase: Exclude<WebDavSyncPhase, 'disabled' | 'idle'>;
  timestamp: string;
  error?: string;
}
```

- [ ] **Step 4: Implement the pure reducer and labels**

`reduceWebDavStatus` accepts an optional current state and event, ignores unrelated document events when a current document is selected, sets success time, and caps errors at 240 characters. Export `webDavStatusLabel(phase, time)` for the five displayed status labels.

- [ ] **Step 5: Implement the Zustand store**

```ts
interface WebDavStoreState {
  phase: WebDavSyncPhase;
  documentId: string;
  localPath: string;
  lastSuccessAt: string;
  error: string;
  versions: WebDavVersion[];
  documents: WebDavDocumentSummary[];
  historyLoading: boolean;
  historyOpen: boolean;
  initialize: (settings: Settings['webdav']) => Promise<void>;
  setCurrentDocument: (path: string | null) => void;
  retry: (settings: Settings['webdav']) => Promise<void>;
  loadDocuments: (settings: Settings['webdav']) => Promise<void>;
  loadVersions: (documentId: string, settings: Settings['webdav']) => Promise<void>;
  downloadVersion: (documentId: string, versionId: string, settings: Settings['webdav']) => Promise<WebDavDownloadedVersion>;
  setEnqueueError: (localPath: string, error: string) => void;
  setHistoryOpen: (open: boolean) => void;
}
```

`initialize` installs one `listen<WebDavSyncEvent>('webdav-sync-status')` listener, sets disabled/idle, and invokes `webdav_retry_pending` when enabled. `setEnqueueError` sets the current path, phase `error`, and a 240-character sanitized message when durable enqueue itself fails. Do not import `useAppStore` inside this store.

- [ ] **Step 6: Run state tests and build**

Run: `node --test tests/webdavIntegration.test.ts` and `npm run build`.

Expected: PASS.

- [ ] **Step 7: Commit frontend state**

```bash
git add src/types/webdav.ts src/utils/webdavState.ts src/stores/webdavStore.ts tests/webdavIntegration.test.ts
git commit -m "feat: track WebDAV synchronization state"
```

## Task 8: Enqueue Only After Successful Local Saves and Retry on Startup

**Files:**
- Modify: `src/stores/appStore.ts:736-760`
- Modify: `src/App.tsx:247-280`
- Modify: `tests/webdavIntegration.test.ts`

- [ ] **Step 1: Add failing save-flow source tests**

```ts
import { readFileSync } from 'node:fs';

test('successful local save enqueues WebDAV without awaiting cloud completion', () => {
  const source = readFileSync(new URL('../src/stores/appStore.ts', import.meta.url), 'utf8');
  const saveTab = source.match(/saveTab:\s*async[\s\S]*?\n\s*},\n\n\s*saveFile:/)?.[0] || '';
  assert.match(saveTab, /await invoke\('save_file_content'/);
  assert.match(saveTab, /void invoke\('webdav_enqueue_backup'/);
  assert.ok(saveTab.indexOf("save_file_content") < saveTab.indexOf("webdav_enqueue_backup"));
});

test('startup initializes WebDAV after settings load', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /useWebDavStore\.getState\(\)\.initialize\(useAppStore\.getState\(\)\.settings\.webdav\)/);
});
```

- [ ] **Step 2: Run integration tests and verify RED**

Run: `node --test tests/webdavIntegration.test.ts`

Expected: FAIL because enqueue and initialization are missing.

- [ ] **Step 3: Integrate enqueue after local persistence**

After `applySavedTab` state update in `saveTab`, read current settings and workspace roots, then call without awaiting:

```ts
const webdav = get().settings.webdav;
if (webdav.enabled && '__TAURI_INTERNALS__' in window) {
  const workspaceRoots = readStoredStringArray('zeditor.workspace-roots');
  void invoke('webdav_enqueue_backup', {
    request: { local_path: path, workspace_roots: workspaceRoots },
    settings: webdav,
  }).catch((error) => {
    useWebDavStore.getState().setEnqueueError(path, String(error));
  });
}
```

Keep this call after local success and outside any awaited cloud transaction.

- [ ] **Step 4: Initialize listener/retry in `App.tsx`**

After `loadSettings` completes, call `useWebDavStore.getState().initialize(useAppStore.getState().settings.webdav)`. Add an effect that updates the current document from `currentFile`.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test tests/webdavIntegration.test.ts tests/windowCloseIntegration.test.ts` and `npm run build`.

Expected: PASS and existing local-save tests remain green.

- [ ] **Step 6: Commit save integration**

```bash
git add src/stores/appStore.ts src/App.tsx tests/webdavIntegration.test.ts
git commit -m "feat: queue WebDAV backup after saving"
```

## Task 9: Add WebDAV Settings and Global History Browser

**Files:**
- Create: `src/components/WebDav/WebDavSettings.tsx`
- Create: `src/components/WebDav/WebDavHistoryDialog.tsx`
- Modify: `src/components/Settings/SettingsPanel.tsx:116-1458`
- Modify: `src/stores/appStore.ts:178`
- Modify: `src/styles/main.css`
- Modify: `tests/webdavSettings.test.ts`

- [ ] **Step 1: Add failing UI contract tests**

```ts
test('Settings exposes WebDAV configuration and global history', () => {
  const panel = read('src/components/Settings/SettingsPanel.tsx');
  const webdav = read('src/components/WebDav/WebDavSettings.tsx');
  assert.match(panel, /id:\s*['"]webdav['"]/);
  assert.match(panel, /activeTab === ['"]webdav['"]/);
  for (const label of ['服务器地址', '用户名', '密码 / 应用密码', '远端根目录', '测试连接', '浏览全部备份']) {
    assert.match(webdav, new RegExp(label));
  }
  assert.match(webdav, /webdav_test_connection/);
});
```

- [ ] **Step 2: Run UI test and verify RED**

Run: `node --test tests/webdavSettings.test.ts`

Expected: FAIL because the components and tab are absent.

- [ ] **Step 3: Implement `WebDavSettings`**

Props:

```ts
interface WebDavSettingsProps {
  value: Settings['webdav'];
  onChange: (value: Settings['webdav']) => void;
  onBrowseHistory: () => void;
}
```

Render the enable switch, URL, username, masked password with visibility toggle, remote root, desktop-only notice, retention copy, Test Connection button, inline success/error, and Browse All Backups. The connection action is:

```ts
const testConnection = async () => {
  setTesting(true);
  setResult(null);
  try {
    const response = await invoke<WebDavConnectionResult>('webdav_test_connection', { settings: value });
    setResult({ ok: true, message: response.message });
  } catch (error) {
    setResult({ ok: false, message: String(error).slice(0, 240) });
  } finally {
    setTesting(false);
  }
};
```

Never log the settings object.

- [ ] **Step 4: Implement `WebDavHistoryDialog`**

Use this props contract:

```ts
interface WebDavHistoryDialogProps {
  open: boolean;
  mode: 'current' | 'global';
  settings: Settings['webdav'];
  currentDocumentId?: string;
  onClose: () => void;
}
```

Support document selection for global mode, loading/empty/error states, version rows, Save As, and close. Implement Save As as:

```ts
const download = async (documentId: string, version: WebDavVersion) => {
  const downloaded = await useWebDavStore.getState().downloadVersion(documentId, version.id, settings);
  const path = await save({ defaultPath: downloaded.filename, filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }] });
  if (typeof path !== 'string') return;
  await invoke('save_file_content', { path, content: downloaded.content });
};
```

Do not call `setContent`, `addTab`, or `updateTabContent`.

- [ ] **Step 5: Wire Settings navigation**

Add `'webdav'` to `SettingsTab`, add `{ id: 'webdav', label: 'WebDAV 备份', description: '自动云备份与历史版本' }`, render `WebDavSettings`, and preserve the draft settings through the existing Save button.

- [ ] **Step 6: Add focused styles**

Add `.webdav-settings`, `.webdav-connection-result`, `.webdav-history-dialog`, `.webdav-document-list`, `.webdav-version-list`, and `.webdav-version-row` rules. Reuse semantic tokens and existing modal geometry; at widths below 720px, stack document/version panes vertically.

- [ ] **Step 7: Run UI tests, lint, and build**

Run: `node --test tests/webdavSettings.test.ts`, `npm run lint`, and `npm run build`.

Expected: all pass.

- [ ] **Step 8: Commit Settings and global history**

```bash
git add src/components/WebDav src/components/Settings/SettingsPanel.tsx src/stores/appStore.ts src/styles/main.css tests/webdavSettings.test.ts
git commit -m "feat: add WebDAV backup settings"
```

## Task 10: Add Status-Bar State and Current-Document History

**Files:**
- Create: `src/components/WebDav/WebDavStatusItem.tsx`
- Modify: `src/components/StatusBar/StatusBar.tsx:27-295`
- Modify: `src/styles/workbench.css:769-1030`
- Modify: `src/styles/main.css`
- Modify: `tests/webdavIntegration.test.ts`

- [ ] **Step 1: Add failing status UI tests**

```ts
test('status bar exposes all WebDAV phases and current history', () => {
  const status = readFileSync(new URL('../src/components/WebDav/WebDavStatusItem.tsx', import.meta.url), 'utf8');
  for (const label of ['未启用', '等待同步', '正在同步', '已同步', '同步失败']) {
    assert.match(status, new RegExp(label));
  }
  assert.match(status, /loadVersions/);
  assert.match(status, /WebDavHistoryDialog/);
  assert.match(status, /retry/);
});
```

- [ ] **Step 2: Run status tests and verify RED**

Run: `node --test tests/webdavIntegration.test.ts`

Expected: FAIL because `WebDavStatusItem` is absent.

- [ ] **Step 3: Implement `WebDavStatusItem`**

Use this props contract:

```ts
interface WebDavStatusItemProps {
  settings: Settings['webdav'];
  currentFile: string | null;
}
```

Consume the WebDAV store. Render one compact button with cloud/spinner/warning glyph and the correct label. Clicking non-error states opens current history and loads versions. Clicking error invokes retry and opens the popover with the sanitized error and an explicit Retry button. Show full errors only in `title` and popover, never in the compact row.

- [ ] **Step 4: Wire the status bar and dialog**

Add `WebDavStatusItem` to `statusbar-center` after higher-priority transient conversion/upload messages. Keep the current word count and UTF-8 items unchanged. Render `WebDavHistoryDialog` outside the statusbar container so it is not clipped.

- [ ] **Step 5: Add compact responsive styles**

Define `.status-webdav`, `.status-webdav.syncing`, `.status-webdav.success`, `.status-webdav.error`, `.webdav-history-popover`, and spinner rules. At narrow status-bar widths hide the timestamp before hiding the cloud glyph; cap popover width with `min(360px, calc(100vw - 24px))`.

- [ ] **Step 6: Run status tests and browser verification**

Run: `node --test tests/webdavIntegration.test.ts` and `npm run build`. Then open the Vite app at 800×600 and verify the five states through controlled store events, no horizontal overflow, and no browser errors.

- [ ] **Step 7: Commit status and current history**

```bash
git add src/components/WebDav/WebDavStatusItem.tsx src/components/StatusBar/StatusBar.tsx src/styles/main.css src/styles/workbench.css tests/webdavIntegration.test.ts
git commit -m "feat: show WebDAV sync status and history"
```

## Task 11: Harden Security, Privacy, and Failure Recovery

**Files:**
- Modify: `src-tauri/src/webdav/client.rs`
- Modify: `src-tauri/src/webdav/manager.rs`
- Modify: `src-tauri/src/webdav/path.rs`
- Modify: `tests/securityHardening.test.ts`
- Modify: `PRIVACY.md`

- [ ] **Step 1: Add failing security assertions**

Add this Rust test beside `sanitize_webdav_error`:

```rust
#[test]
fn sanitized_errors_exclude_credentials_and_content() {
    let password = "super-secret-password";
    let document = "private document sentence";
    let raw = format!("server rejected {password}: {document}");
    let message = sanitize_webdav_error(Some(500), &raw);
    assert!(!message.contains(password));
    assert!(!message.contains(document));
    assert!(message.len() <= 240);
}
```

Add Node source tests:

```ts
test('WebDAV code never logs credentials or document content', () => {
  const sources = [
    read('src/stores/webdavStore.ts'),
    read('src/components/WebDav/WebDavSettings.tsx'),
    read('src-tauri/src/webdav/client.rs'),
    read('src-tauri/src/webdav/manager.rs'),
  ].join('\n');
  assert.doesNotMatch(sources, /console\.log|println!|dbg!/);
  assert.doesNotMatch(sources, /Authorization.*\{.*password|password.*Authorization/);
});
```

- [ ] **Step 2: Run security tests and verify RED where protections are missing**

Run: `node --test tests/securityHardening.test.ts` and `cargo test --manifest-path src-tauri/Cargo.toml webdav::security_tests`.

Expected: at least one new assertion fails before hardening is complete.

- [ ] **Step 3: Centralize sanitized WebDAV errors**

Implement `sanitize_webdav_error(status, text) -> String`, mapping `401`, `403`, `404`, `409`, timeouts, and unsupported methods to fixed Chinese messages. Strip control characters and cap unknown response text at 240 characters.

- [ ] **Step 4: Enforce path and download safety**

Ensure encoded generated segments cannot contain `/`, `..`, query, fragment, or embedded credentials. Verify download SHA-256 in Rust before returning bytes. Ensure the frontend writes only after the Save As dialog returns a path.

- [ ] **Step 5: Update privacy documentation**

Add that enabled WebDAV sends saved document content, relative path metadata, timestamps, hashes, and version manifests directly to the user-configured server; credentials remain in the local application settings file; Zeditor maintainers do not receive this traffic.

- [ ] **Step 6: Run security tests and verify GREEN**

Run: `node --test tests/securityHardening.test.ts` and `cargo test --manifest-path src-tauri/Cargo.toml webdav::security_tests`.

Expected: PASS.

- [ ] **Step 7: Commit hardening and privacy docs**

```bash
git add src-tauri/src/webdav tests/securityHardening.test.ts PRIVACY.md
git commit -m "fix: harden WebDAV backup boundaries"
```

## Task 12: Documentation, Regression, and Release Packaging

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/releases/v0.3.8.md`
- Verify: all changed production and test files

- [ ] **Step 1: Document the final user workflow**

Add concise sections covering configuration, connection testing, one-way semantics, current copy, 20-version history, status meanings, retry behavior, Save As downloads, and credential storage. Explicitly state that WebDAV failure never rolls back a local save.

- [ ] **Step 2: Run the complete frontend verification**

```bash
npm test
npm run lint
npm run build
```

Expected: all tests pass, ESLint exits 0, and Vite completes a production build.

- [ ] **Step 3: Run the complete Rust verification**

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
```

Expected: all commands exit 0 with no warnings promoted to errors.

- [ ] **Step 4: Perform desktop behavior verification**

Use a local WebDAV fixture and verify: connection test; changed save upload; unchanged save dedupe; 21 distinct saves retain 20 manifest entries; offline queue persistence; restart retry; error-state manual retry; current history; global history; Save As download; hash mismatch rejection; and local save independence.

- [ ] **Step 5: Build release installers**

Run: `npm run tauri build`.

Expected artifacts:

```text
src-tauri/target/release/bundle/msi/Zeditor_0.3.8_x64_en-US.msi
src-tauri/target/release/bundle/nsis/Zeditor_0.3.8_x64-setup.exe
```

- [ ] **Step 6: Verify artifact freshness and hashes**

Use PowerShell `Get-Item` and `Get-FileHash -Algorithm SHA256` for both installers. Confirm timestamps are from the current build and report sizes and hashes.

- [ ] **Step 7: Commit documentation and final integration**

```bash
git add README.md CHANGELOG.md docs/releases/v0.3.8.md
git commit -m "docs: explain WebDAV document backup"
```

- [ ] **Step 8: Review the final branch**

Run: `git status --short`, `git diff --check`, and `git log --oneline --max-count=15`.

Expected: no accidental generated files, no whitespace errors, and a sequence of focused WebDAV commits.
