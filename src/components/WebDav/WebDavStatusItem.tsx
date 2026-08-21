import { useEffect, useRef, useState } from 'react';
import type { S3Settings, WebDavSettings } from '../../types/webdav';
import { useWebDavStore } from '../../stores/webdavStore';
import { useS3Store } from '../../stores/s3Store';
import { webDavStatusLabel } from '../../utils/webdavState';
import { WebDavHistoryDialog } from './WebDavHistoryDialog';

interface CloudStatusItemProps {
  settings: WebDavSettings;
  s3Settings: S3Settings;
  currentFile: string | null;
  /** 打开「设置 → 云同步」页（未启用时点击触发，与「开启 AI」一致）。 */
  onOpenSettings: () => void;
  /** 直接启用 / 停用某个后端（写入设置并持久化）。 */
  onToggleProvider: (provider: 'webdav' | 's3', enabled: boolean) => void;
}

/** 云同步图标：与状态栏其他状态图标（SVG fill currentColor）风格一致。 */
function CloudGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M4.8 12.5h6.6a2.4 2.4 0 0 0 .5-4.75 4.1 4.1 0 0 0-8.1.7A2.6 2.6 0 0 0 4.8 12.5Z" />
    </svg>
  );
}

function statusDot(phase: string): string {
  return phase === 'success'
    ? '✓'
    : phase === 'error'
      ? '✕'
      : phase === 'syncing'
        ? '↻'
        : phase === 'queued'
          ? '⋯'
          : '·';
}

/**
 * Aggregated status-bar item for cloud backup (WebDAV + S3).
 *
 * Enabled when either provider is on. Clicking opens a menu (like the AI
 * trigger) listing each provider's live status with inline toggle and a
 * history entry point.
 */
export function WebDavStatusItem({
  settings,
  s3Settings,
  currentFile,
  onOpenSettings,
  onToggleProvider,
}: CloudStatusItemProps) {
  // Both hooks must run unconditionally; pick the matching store by provider.
  const webdavState = useWebDavStore();
  const s3State = useS3Store();
  const [menuOpen, setMenuOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);

  // 点击菜单外部或按 Esc 时关闭，与 AI 菜单行为一致。
  useEffect(() => {
    if (!menuOpen && !popoverOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuOpen && !controlRef.current?.contains(target)) setMenuOpen(false);
      if (popoverOpen && !controlRef.current?.contains(target)) setPopoverOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setPopoverOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, popoverOpen]);

  const enabled = settings.enabled || s3Settings.enabled;
  const anyError = webdavState.phase === 'error' || s3State.phase === 'error';
  const anySyncing = webdavState.phase === 'syncing' || s3State.phase === 'syncing';

  if (!enabled) {
    return (
      <button
        type="button"
        className="status-item status-button status-webdav"
        title="云同步未启用，点击开启"
        onClick={onOpenSettings}
      >
        <CloudGlyph />
        <span>云同步</span>
      </button>
    );
  }

  const openHistory = (provider: 'webdav' | 's3') => {
    const store = provider === 's3' ? s3State : webdavState;
    const providerSettings: WebDavSettings | S3Settings =
      provider === 's3' ? s3Settings : settings;
    const loadVersions = store.loadVersions as (
      id: string,
      s: WebDavSettings | S3Settings,
    ) => Promise<void>;
    if (store.documentId) void loadVersions(store.documentId, providerSettings);
    store.setHistoryOpen(true);
    setMenuOpen(false);
  };

  const toggleProvider = (provider: 'webdav' | 's3', providerEnabled: boolean) => {
    onToggleProvider(provider, !providerEnabled);
    setMenuOpen(false);
  };

  const providerRow = (provider: 'webdav' | 's3') => {
    const store = provider === 's3' ? s3State : webdavState;
    const providerSettings = provider === 's3' ? s3Settings : settings;
    const label = provider === 's3' ? 'S3' : 'WebDAV';
    const statusText = providerSettings.enabled
      ? webDavStatusLabel(store.phase, '')
      : '未启用';
    const dot = providerSettings.enabled ? statusDot(store.phase) : statusDot('idle');

    return (
      <div className={`status-cloud-row ${providerSettings.enabled && store.phase === 'error' ? 'error' : ''}`}>
        <span className={`status-cloud-dot ${providerSettings.enabled ? store.phase : ''}`}>{dot}</span>
        <div className="status-cloud-row-main">
          <strong>{label}</strong>
          <small>{statusText}{providerSettings.enabled && store.phase === 'success' && store.lastSuccessAt ? ` · ${formatClock(store.lastSuccessAt)}` : ''}</small>
        </div>
        <div className="status-cloud-row-actions">
          {providerSettings.enabled && (
            <button
              type="button"
              className="status-cloud-view"
              title="查看备份与历史版本"
              onClick={() => openHistory(provider)}
            >
              历史
            </button>
          )}
          <button
            type="button"
            className={`status-cloud-toggle${providerSettings.enabled ? ' is-on' : ''}`}
            role="switch"
            aria-checked={providerSettings.enabled}
            title={providerSettings.enabled ? `关闭 ${label} 同步` : `开启 ${label} 同步`}
            onClick={() => toggleProvider(provider, providerSettings.enabled)}
          >
            {providerSettings.enabled ? '开' : '关'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="status-cloud-control" ref={controlRef}>
        <button
          type="button"
          className={`status-item status-button status-webdav is-enabled ${anyError ? 'error' : ''} ${anySyncing ? 'syncing' : ''} ${menuOpen ? 'active' : ''}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={anyError ? '云同步异常，点击查看' : '打开云同步菜单'}
          onClick={() => setMenuOpen(open => !open)}
        >
          {anySyncing ? (
            <span className="webdav-spinner" aria-hidden="true" />
          ) : (
            <CloudGlyph />
          )}
          <span>云同步</span>
          <span className="status-ai-chevron" aria-hidden="true">⌃</span>
        </button>

        {menuOpen && (
          <div className="status-cloud-menu" role="menu" aria-label="云同步">
            <div className="status-cloud-menu-header">
              <div><strong>云同步</strong><small>WebDAV 与 S3 自动备份</small></div>
              <button type="button" className="status-cloud-close" onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            <div className="status-cloud-providers">
              {providerRow('webdav')}
              {providerRow('s3')}
            </div>
            <button type="button" className="status-cloud-settings" onClick={onOpenSettings}>打开云同步设置</button>
          </div>
        )}
      </div>

      {popoverOpen && (webdavState.phase === 'error' || s3State.phase === 'error') && (
        <div className="webdav-history-popover">
          <p className="webdav-popover-error">
            {webdavState.phase === 'error' ? `WebDAV：${webdavState.error}` : ''}
            {s3State.phase === 'error' ? `S3：${s3State.error}` : ''}
          </p>
          <button
            type="button"
            className="button"
            onClick={() => {
              if (webdavState.phase === 'error') void webdavState.retry(settings);
              if (s3State.phase === 'error') void s3State.retry(s3Settings);
              setPopoverOpen(false);
            }}
          >
            重试
          </button>
        </div>
      )}

      {currentFile && (
        <>
          <WebDavHistoryDialog
            open={webdavState.historyOpen && webdavState.documentId !== ''}
            mode="current"
            provider="webdav"
            settings={settings}
            currentDocumentId={webdavState.documentId || undefined}
            onClose={() => webdavState.setHistoryOpen(false)}
          />
          <WebDavHistoryDialog
            open={s3State.historyOpen && s3State.documentId !== ''}
            mode="current"
            provider="s3"
            settings={s3Settings}
            currentDocumentId={s3State.documentId || undefined}
            onClose={() => s3State.setHistoryOpen(false)}
          />
        </>
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
