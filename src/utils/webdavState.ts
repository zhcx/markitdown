import type { WebDavSyncEvent, WebDavSyncPhase } from '../types/webdav';

/** The status-bar-visible synchronization state for one (or the current) document. */
export interface WebDavStatusState {
  document_id: string;
  local_path: string;
  phase: WebDavSyncPhase;
  error: string;
  last_success_at: string;
}

const MAX_ERROR_LENGTH = 240;

export const initialWebDavStatus = (): WebDavStatusState => ({
  document_id: '',
  local_path: '',
  phase: 'idle',
  error: '',
  last_success_at: '',
});

/**
 * Reduce one `webdav-sync-status` event into status-bar state.
 *
 * When a current document is selected, events for other documents are ignored so
 * the status bar keeps reflecting the document the user is actually editing.
 * Success records the timestamp; errors are sanitized to a bounded length.
 */
export const reduceWebDavStatus = (
  current: WebDavStatusState | undefined,
  event: WebDavSyncEvent,
): WebDavStatusState => {
  const base = current ?? initialWebDavStatus();
  if (current && base.document_id !== '' && base.document_id !== event.document_id) {
    return base;
  }
  if (event.phase === 'success') {
    return {
      ...base,
      document_id: event.document_id,
      local_path: event.local_path,
      phase: 'success',
      error: '',
      last_success_at: event.timestamp,
    };
  }
  return {
    ...base,
    document_id: event.document_id,
    local_path: event.local_path,
    phase: event.phase,
    error: event.phase === 'error' ? (event.error ?? '').slice(0, MAX_ERROR_LENGTH) : '',
  };
};

/** Human-readable status label for the five displayed status states. */
export const webDavStatusLabel = (phase: WebDavSyncPhase, time: string): string => {
  switch (phase) {
    case 'disabled':
      return '未启用';
    case 'queued':
      return '等待同步';
    case 'syncing':
      return '正在同步';
    case 'success':
      return time ? `已同步 · ${time}` : '已同步';
    case 'error':
      return '同步失败 · 点击重试';
    default:
      return '';
  }
};
