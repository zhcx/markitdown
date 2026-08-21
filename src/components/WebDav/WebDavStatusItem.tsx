import { useState } from 'react';
import type { WebDavSettings } from '../../types/webdav';
import { useWebDavStore } from '../../stores/webdavStore';
import { webDavStatusLabel } from '../../utils/webdavState';
import { WebDavHistoryDialog } from './WebDavHistoryDialog';

interface WebDavStatusItemProps {
  settings: WebDavSettings;
  currentFile: string | null;
}

/** Compact status-bar item for the current document's WebDAV synchronization. */
export function WebDavStatusItem({ settings, currentFile }: WebDavStatusItemProps) {
  const { phase, documentId, lastSuccessAt, error, retry, loadVersions, setHistoryOpen } =
    useWebDavStore();
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!settings.enabled) {
    return (
      <button
        type="button"
        className="status-item status-webdav"
        title="WebDAV 备份未启用，可在设置中开启"
        onClick={() => setPopoverOpen(false)}
      >
        <span aria-hidden="true">☁</span> 未启用
      </button>
    );
  }

  const time = formatClock(lastSuccessAt);
  const isError = phase === 'error';
  const isSyncing = phase === 'syncing';

  const handleClick = () => {
    if (isError) {
      void retry(settings);
      setPopoverOpen(true);
      return;
    }
    // Success, idle, and queued states open the current-document history.
    if (documentId || phase === 'success') {
      if (documentId) void loadVersions(documentId, settings);
      setHistoryOpen(true);
    }
    setPopoverOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`status-item status-webdav ${isError ? 'error' : ''} ${isSyncing ? 'syncing' : ''} ${phase === 'success' ? 'success' : ''}`}
        title={error || webDavStatusLabel(phase, time)}
        onClick={handleClick}
      >
        {isSyncing ? <span className="webdav-spinner" aria-hidden="true" /> : <span aria-hidden="true">{isError ? '⚠' : '☁'}</span>}
        <span className="status-webdav-label">{phase === 'success' ? '已同步' : webDavStatusLabel(phase, '')}</span>
        {phase === 'success' && time && <span className="status-webdav-time"> · {time}</span>}
      </button>

      {popoverOpen && isError && (
        <div className="webdav-history-popover">
          <p className="webdav-popover-error">{error || '同步失败'}</p>
          <button
            type="button"
            className="button"
            onClick={() => void retry(settings)}
          >
            重试
          </button>
        </div>
      )}

      {currentFile && (
        <WebDavHistoryDialog
          open={documentId !== '' && !popoverOpen}
          mode="current"
          settings={settings}
          currentDocumentId={documentId || undefined}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}

function formatClock(timestamp: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
