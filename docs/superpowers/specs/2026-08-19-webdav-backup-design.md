# WebDAV Document Backup Design

**Date:** 2026-08-19

**Status:** Approved for implementation planning

## Summary

Zeditor will provide desktop-only, one-way WebDAV backup for saved documents. A successful local save immediately completes the local transaction and then queues an asynchronous WebDAV upload. The remote destination keeps one current copy plus the latest 20 distinct-content snapshots. Users configure WebDAV in Settings, monitor synchronization in the bottom status bar, and download any historical version through a Save As dialog without changing the open document.

## Goals

- Add WebDAV server, username, password, remote-root, enable, and connection-test settings.
- Queue a cloud backup only after the local file write succeeds.
- Keep local saving usable while offline or while WebDAV is failing.
- Overwrite the current remote copy automatically.
- Create history only when document content changes, using SHA-256 for deduplication.
- Retain the latest 20 versions per document.
- Persist failed work as retryable metadata across application restarts.
- Expose synchronization state in the bottom status bar.
- Let users browse the current document's history from the status bar and all backups from Settings.
- Download a selected version to a user-chosen local path without modifying the current document.

## Non-goals

- Bidirectional synchronization, remote-to-local automatic updates, or merge conflict handling.
- Restoring a historical version directly over the current document.
- Depending on provider-specific version-history extensions.
- End-to-end encryption of document content.
- Operating-system credential-vault integration in this iteration.
- Managing remote deletions or renames as a mirror of local filesystem deletions or renames.

## Approved Product Decisions

- Synchronization is one-way: local content is authoritative.
- The latest remote file is overwritten after each distinct successful local save.
- Zeditor manages portable history rather than relying on the WebDAV provider.
- Each document retains the latest 20 distinct-content versions.
- Historical versions are downloaded through Save As only.
- Remote paths are workspace-relative. Files outside a workspace use a collision-safe `Standalone` path.
- Failed jobs persist and retry on application startup, the next save, or an explicit retry action.
- WebDAV credentials use the existing settings-file persistence model.
- The status bar is the primary daily entry point; Settings provides configuration and a global backup browser.

## Architecture

### Rust WebDAV protocol client

Create a focused WebDAV module responsible for:

- validating `http://` and `https://` endpoints;
- applying Basic authentication when a username is present, or no authentication when it is empty;
- creating remote collections recursively with `MKCOL`;
- reading resources with `GET` and metadata with `PROPFIND` where needed;
- creating or replacing resources with `PUT`;
- deleting probe files and pruned snapshots with `DELETE`;
- enforcing connect and total request timeouts;
- classifying HTTP, authentication, permission, and network errors without exposing credentials or content.

The existing `reqwest` dependency is sufficient. The module must not log authorization headers, passwords, or document bodies.

### Rust synchronization manager

Add a Tauri-managed synchronization manager with a globally serialized worker. Global serialization prevents two documents from racing while updating the shared remote index. The manager owns:

- an in-memory latest-task-per-document map;
- a persisted pending-task file in the application data directory;
- task coalescing so repeated saves retain only the newest local-file state;
- retry execution using the latest bytes read from the already-saved local path;
- event emission for queue, upload, success, and error states;
- deterministic retry metadata so partial failures do not create duplicate history entries.

Pending metadata contains local path, document identity, workspace mapping, remote path, queued timestamp, expected content hash, and deterministic version ID. It does not contain passwords or a second copy of document content. On retry, the manager reads the latest local file; if the file no longer exists, the task remains failed with a user-visible diagnostic until dismissed or superseded by a later save.

If the bytes read during execution no longer match the queued hash, the manager atomically replaces the task hash and version ID before making any WebDAV request. This preserves the rule that retries upload the newest local state without allowing stale metadata to create a mislabeled snapshot.

### Frontend synchronization store

Create a dedicated WebDAV Zustand store instead of enlarging `appStore`. It manages:

- `disabled`, `idle`, `queued`, `syncing`, `success`, and `error` states;
- current document identity and path;
- last successful synchronization time;
- a short, sanitized error message;
- current-document and global history loading states;
- status-bar popover visibility;
- retry, list, and download actions;
- the Tauri event listener lifecycle.

The store receives settings and document references as parameters rather than importing mutable application state, avoiding a circular dependency with `appStore`.

### Existing save flow integration

`appStore.saveTab` remains the single local-save transaction boundary:

1. write the tab content with `save_file_content`;
2. mark the tab saved and update its local path;
3. when WebDAV is enabled, invoke the enqueue command without awaiting remote completion;
4. always clear `isSaving` based only on local-file completion.

WebDAV failure never marks the document dirty again and never rejects an otherwise successful local save.

## Settings Model

Add a defaulted `webdav` object to both Rust and TypeScript settings:

```ts
interface WebDavSettings {
  enabled: boolean;
  server_url: string;
  username: string;
  password: string;
  remote_root: string;
}
```

Defaults are disabled with empty credentials and `/Zeditor` as the suggested remote root. Rust fields use `#[serde(default)]` so existing settings files continue to deserialize. Frontend normalization fills missing and malformed values before components render.

The password field is masked with a visibility toggle. Settings persistence follows the current API-key model and clearly labels that credentials are stored on the local device. Saving settings does not require a successful connection test; failed synchronization remains visible and retryable.

## Remote Layout and Identity

The configured remote root contains current files and a hidden history area:

```text
<remote-root>/
├─ <workspace-name>/
│  └─ <workspace-relative-path>       # current remote copy
├─ Standalone/
│  └─ <stable-id>/<filename>          # current copy outside a workspace
└─ .zeditor-history/
   ├─ index.json                      # global document catalog
   └─ documents/
      └─ <document-id>/
         ├─ manifest.json             # latest 20 visible versions
         └─ versions/
            └─ <version-id>.<ext>
```

Workspace files use the containing workspace root selected by the user. The remote current path is prefixed with the sanitized workspace directory name to avoid collisions across multiple open roots. The document ID is a SHA-256 digest of the normalized workspace identity and relative path. Standalone files use a digest of a normalized local identity but expose only the original filename, not the full local directory path.

`index.json` provides the Settings global browser without requiring a recursive server scan. A per-document `manifest.json` contains display name, remote current path, and version entries with version ID, UTC timestamp, size, SHA-256, and snapshot path.

## Synchronization Transaction

For each queued document:

1. Read the latest local bytes and calculate SHA-256.
2. Read the per-document manifest when it exists.
3. If the hash equals the newest successful version, skip snapshot creation and ensure the current remote copy is present.
4. Create missing current/history collections recursively.
5. Upload the deterministic snapshot resource.
6. Build a manifest containing the new version and at most 20 entries, then upload it.
7. Update the global history index while the global worker lock is held.
8. Upload the current remote copy with `PUT`, replacing an existing resource.
9. Emit success only after the manifest, index, and current copy are confirmed.
10. Delete snapshot files pruned from the visible manifest. Deletion failures are recorded as cleanup diagnostics but do not change a successful sync into a failed local save.

If a snapshot succeeds but a later step fails, retry reuses the same deterministic version ID. The manifest hash check makes the operation idempotent and prevents duplicate history rows.

## Connection Test

The test-connection command validates real read/write capability:

1. validate and normalize settings;
2. create the configured remote root when absent;
3. upload a small random probe resource;
4. read or inspect the probe;
5. delete the probe;
6. return a sanitized success result.

Authentication failures (`401`), permission failures (`403`), unsupported methods, invalid endpoints, and network timeouts have distinct user-facing messages. Cleanup is attempted even when probe verification fails.

## Retry and Startup Behavior

- Enqueue persists task metadata before starting network work.
- A later save for the same document replaces the pending entry with the latest hash and timestamp.
- The frontend calls a retry-pending command once settings finish loading and WebDAV is enabled.
- Clicking the error status invokes retry immediately.
- A successful task removes its pending entry atomically.
- Disabling WebDAV pauses pending tasks without deleting them. Re-enabling resumes them.
- Changing credentials or endpoint causes retries to use the newest saved settings.

## Tauri Command and Event Contract

Commands:

- `webdav_test_connection(settings) -> WebDavConnectionResult`
- `webdav_enqueue_backup(request, settings) -> WebDavQueuedResult`
- `webdav_retry_pending(settings) -> WebDavRetryResult`
- `webdav_list_documents(settings) -> Vec<WebDavDocumentSummary>`
- `webdav_list_versions(document_id, settings) -> Vec<WebDavVersion>`
- `webdav_download_version(document_id, version_id, settings) -> WebDavDownloadedVersion`

The enqueue command returns after durable queue persistence, not after network completion.

Events use one `webdav-sync-status` channel with a typed payload containing document ID, local path, phase, optional progress description, timestamp, and sanitized error. Payloads never contain credentials or document content.

## User Interface

### Settings

Add a `WebDAV 备份` navigation item with:

- enable switch;
- server URL;
- username;
- masked password with visibility toggle;
- remote root;
- Test Connection action and inline result;
- an explanation that local saving is independent of cloud success;
- retention text: latest 20 distinct-content versions;
- Browse All Backups action.

The desktop-only limitation is shown in browser preview mode.

### Status bar

Show one compact cloud item:

- `☁ 未启用`
- `☁ 等待同步`
- `↻ 正在同步`
- `☁ 已同步 · HH:mm`
- `⚠ 同步失败 · 点击重试`

Clicking success, idle, or queued states opens the current-document history popover. Clicking an error retries first and keeps history accessible through the popover. Tooltips expose the complete sanitized error when the status bar cannot fit it.

### History browsing and download

The status popover lists the current document's versions with local-time timestamp, size, short hash, and Save As action. Settings opens a global browser backed by `index.json`, then drills into a selected document's manifest.

Downloading performs a WebDAV `GET`, verifies the manifest SHA-256, asks the user for a local path, and writes only after verification. It never mutates the open tab, current document path, dirty state, remote latest copy, or synchronization queue.

## Error Handling and Security

- Accept only HTTP and HTTPS URLs; reject embedded credentials in the URL.
- Apply connect and total request timeouts.
- Treat existing-collection responses from `MKCOL` as success where WebDAV semantics allow it.
- Keep local-save results independent from every network result.
- Sanitize server response bodies before presenting errors and cap message length.
- Never log password, authorization headers, settings objects, or document bytes.
- Validate remote paths and percent-encode individual path segments.
- Prevent `..`, query, and fragment injection in configured remote roots and generated paths.
- Verify downloaded bytes against the version manifest before writing locally.
- Keep browser preview read-only for WebDAV operations.

## Testing Strategy

### TypeScript tests

- settings migration supplies WebDAV defaults;
- successful local saves enqueue only when enabled;
- local-save failure does not enqueue;
- enqueue is non-blocking with respect to local save completion;
- status events produce the correct status-bar state;
- current-document history and global history actions invoke the correct commands;
- historical download uses Save As and does not alter the open tab;
- UI source contains all settings fields and five status states.

### Rust unit tests

- endpoint and remote-root validation;
- percent-encoding and traversal rejection;
- workspace-relative and standalone mapping;
- deterministic document and version IDs;
- manifest parsing and malformed-manifest errors;
- SHA-256 deduplication;
- retention trimming to 20 entries;
- pending-task coalescing and atomic persistence;
- error sanitization excludes credentials and document content.

### Local WebDAV protocol tests

Use a small in-process local HTTP fixture to capture requests without external network access. Cover:

- recursive `MKCOL` handling;
- `PUT snapshot -> PUT manifest -> PUT index -> PUT current` ordering;
- Basic authentication and anonymous mode;
- connection-test probe upload/read/delete;
- partial failure followed by idempotent retry;
- version `GET` and hash verification;
- `401`, `403`, timeout, and malformed response handling.

### Full verification

- existing Node test suite;
- ESLint;
- TypeScript/Vite production build;
- Cargo format, tests, and Clippy;
- Tauri release build and Windows MSI/NSIS artifact verification.

## Acceptance Criteria

- With valid settings, saving a changed document leaves it locally saved and eventually shows `已同步`.
- The remote current copy matches the latest locally saved bytes.
- Re-saving unchanged content does not add a history version.
- The 21st distinct save leaves exactly 20 visible manifest entries.
- Offline saves remain local successes and create a persistent retryable task.
- Restarting with a pending task resumes synchronization after settings load.
- Status-bar state accurately reflects queued, syncing, success, and failure states.
- A selected historical version downloads through Save As and passes hash verification.
- Existing settings files without WebDAV fields continue to load.
- No credential or document body appears in logs or status events.
