/** Frontend mirror of the Rust WebDAV DTOs and status contracts. */

export type WebDavSyncPhase = 'disabled' | 'idle' | 'queued' | 'syncing' | 'success' | 'error';

export interface WebDavSyncEvent {
  document_id: string;
  local_path: string;
  phase: Exclude<WebDavSyncPhase, 'disabled' | 'idle'>;
  /** Optional progress description; absent for most phases. */
  progress?: string;
  timestamp: string;
  /** Sanitized failure message; only present on the error phase. */
  error?: string;
}

export interface WebDavSettings {
  enabled: boolean;
  server_url: string;
  username: string;
  password: string;
  remote_root: string;
}

export interface WebDavDocumentSummary {
  document_id: string;
  display_name: string;
  current_path: string;
  latest_at: string;
}

export interface WebDavVersion {
  id: string;
  created_at: string;
  size: number;
  sha256: string;
  snapshot_path: string;
}

export interface WebDavDownloadedVersion {
  filename: string;
  content: string;
  size: number;
  sha256: string;
}

export interface WebDavConnectionResult {
  message: string;
}
