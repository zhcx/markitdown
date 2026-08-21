import { useState } from 'react';
import type { WebDavSettings } from '../../types/webdav';
import { useWebDavStore } from '../../stores/webdavStore';
import { webDavStatusLabel } from '../../utils/webdavState';
import { WebDavHistoryDialog } from './WebDavHistoryDialog';

interface WebDavStatusItemProps {
  settings: WebDavSettings;
  currentFile: string | null;
  /** 打开「设置 → WebDAV 备份」页（未启用时点击触发，与「开启 AI」一致）。 */
  onOpenSettings: () => void;
}

/** 云同步图标：与状态栏其他状态图标（SVG fill currentColor）风格一致。 */
function CloudGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M4.8 12.5h6.6a2.4 2.4 0 0 0 .5-4.75 4.1 4.1 0 0 0-8.1.7A2.6 2.6 0 0 0 4.8 12.5Z" />
    </svg>
  );
}

/** Compact status-bar item for the current document's WebDAV synchronization. */
export function WebDavStatusItem({ settings, currentFile, onOpenSettings }: WebDavStatusItemProps) {
  const { phase, documentId, lastSuccessAt, error, retry, loadVersions, setHistoryOpen } =
    useWebDavStore();
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!settings.enabled) {
    // 与「开启 AI」触发器一致：未启用时点击直接进入设置页。
    return (
      <button
        type="button"
        className="status-item status-button status-webdav"
        title="WebDAV 备份未启用，点击开启"
        onClick={onOpenSettings}
      >
        <CloudGlyph />
        <span>云同步</span>
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
        className={`status-item status-button status-webdav is-enabled ${isError ? 'error' : ''} ${isSyncing ? 'syncing' : ''} ${phase === 'success' ? 'success' : ''}`}
        title={error || webDavStatusLabel(phase, time)}
        onClick={handleClick}
      >
        {isSyncing ? (
          <span className="webdav-spinner" aria-hidden="true" />
        ) : (
          <CloudGlyph />
        )}
        <span className="status-webdav-label">{webDavStatusLabel(phase, '')}</span>
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
