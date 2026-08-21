import { useEffect, useState } from 'react';
import type { S3Settings, WebDavSettings } from '../../types/webdav';
import { useWebDavStore } from '../../stores/webdavStore';
import { useS3Store } from '../../stores/s3Store';
import { webDavStatusLabel } from '../../utils/webdavState';
import { WebDavHistoryDialog } from './WebDavHistoryDialog';

interface CloudStatusItemProps {
  settings: WebDavSettings;
  s3Settings: S3Settings;
  /** 打开「设置 → 云同步」页（未启用时点击触发）。 */
  onOpenSettings: () => void;
  /** 直接启用 / 停用某个后端（写入设置并持久化）。 */
  onToggleProvider: (provider: 'webdav' | 's3', enabled: boolean) => void;
}

function CloudGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path d="M4.8 12.5h6.6a2.4 2.4 0 0 0 .5-4.75 4.1 4.1 0 0 0-8.1.7A2.6 2.6 0 0 0 4.8 12.5Z" />
    </svg>
  );
}

/**
 * 聚合云同步状态栏项 + 完整云同步面板弹窗。
 *
 * 点击状态栏按钮打开居中弹窗（不是下拉菜单），弹窗内含两个后端
 * 状态卡片 + 开关 + 查看全部备份 + 设置入口。
 */
export function WebDavStatusItem({
  settings,
  s3Settings,
  onOpenSettings,
  onToggleProvider,
}: CloudStatusItemProps) {
  const webdavState = useWebDavStore();
  const s3State = useS3Store();
  const [panelOpen, setPanelOpen] = useState(false);
  // 哪个后端打开了「查看全部备份」弹窗
  const [globalHistoryProvider, setGlobalHistoryProvider] = useState<'webdav' | 's3' | null>(null);

  const enabled = settings.enabled || s3Settings.enabled;
  const anyError = webdavState.phase === 'error' || s3State.phase === 'error';
  const anySyncing = webdavState.phase === 'syncing' || s3State.phase === 'syncing';

  // Esc 关闭面板
  useEffect(() => {
    if (!panelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [panelOpen]);

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

  const viewAllBackups = (provider: 'webdav' | 's3') => {
    setGlobalHistoryProvider(provider);
    setPanelOpen(false);
  };

  const summaryText = (): string => {
    const bothOff = !settings.enabled && !s3Settings.enabled;
    if (bothOff) return '未启用';
    const hasError = webdavState.phase === 'error' || s3State.phase === 'error';
    const allSynced =
      (!settings.enabled || webdavState.phase === 'success') &&
      (!s3Settings.enabled || s3State.phase === 'success');
    if (hasError) return '存在同步异常';
    if (anySyncing) return '正在同步…';
    if (allSynced) return '已同步';
    return '就绪';
  };

  return (
    <>
      {/* ─── 状态栏触发按钮 ─── */}
      <button
        type="button"
        className={`status-item status-button status-webdav is-enabled ${anyError ? 'error' : ''} ${anySyncing ? 'syncing' : ''}`}
        title="打开云同步面板"
        onClick={() => setPanelOpen(true)}
      >
        {anySyncing ? <span className="webdav-spinner" aria-hidden="true" /> : <CloudGlyph />}
        <span>云同步 · {summaryText()}</span>
      </button>

      {/* ─── 云同步面板弹窗 ─── */}
      {panelOpen && (
        <div className="cloud-panel-overlay" onClick={() => setPanelOpen(false)}>
          <div className="cloud-panel" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="cloud-panel-header">
              <div className="cloud-panel-title">
                <CloudGlyph size={18} />
                <div>
                  <h3>云同步</h3>
                  <p className="cloud-panel-subtitle">{summaryText()} · 保留最近 20 个版本</p>
                </div>
              </div>
              <button type="button" className="cloud-panel-close" onClick={() => setPanelOpen(false)} aria-label="关闭">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m4 4 8 8m0-8-8 8" /></svg>
              </button>
            </div>

            {/* Provider Cards */}
            <div className="cloud-panel-cards">
              {(['webdav', 's3'] as const).map(provider => {
                const store = provider === 's3' ? s3State : webdavState;
                const providerSettings = provider === 's3' ? s3Settings : settings;
                const label = provider === 's3' ? 'S3 对象存储' : 'WebDAV 服务器';
                const providerEnabled = providerSettings.enabled;
                const phase = providerEnabled ? store.phase : 'idle';
                const phaseLabel = providerEnabled ? webDavStatusLabel(store.phase, '') : '未启用';
                const serverInfo = provider === 's3'
                  ? (providerSettings as S3Settings).endpoint || '未配置端点'
                  : (providerSettings as WebDavSettings).server_url || '未配置地址';

                return (
                  <div
                    key={provider}
                    className={`cloud-card ${providerEnabled ? `cloud-card-${phase}` : 'cloud-card-off'}`}
                  >
                    <div className="cloud-card-header">
                      <div className="cloud-card-info">
                        <span className={`cloud-card-dot ${phase}`} />
                        <div>
                          <strong>{label}</strong>
                          <small>{serverInfo}</small>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`cloud-switch${providerEnabled ? ' is-on' : ''}`}
                        role="switch"
                        aria-checked={providerEnabled}
                        aria-label={`${label} 同步`}
                        title={providerEnabled ? `关闭 ${label}` : `开启 ${label}`}
                        onClick={() => onToggleProvider(provider, !providerEnabled)}
                      >
                        <span className="cloud-switch-thumb" />
                      </button>
                    </div>

                    {providerEnabled && (
                      <div className="cloud-card-status">
                        <span className={`cloud-status-badge ${phase}`}>
                          {phase === 'success' && store.lastSuccessAt
                            ? `✓ 已同步 · ${formatClock(store.lastSuccessAt)}`
                            : phase === 'error'
                              ? `✕ ${store.error?.slice(0, 60) || '同步失败'}`
                              : phase === 'syncing'
                                ? '↻ 正在同步…'
                                : phase === 'queued'
                                  ? '⋯ 等待同步'
                                  : phaseLabel
                          }
                        </span>
                        {phase === 'error' && (
                          <button
                            type="button"
                            className="cloud-card-retry"
                            onClick={() => {
                              const retry = store.retry as (s: WebDavSettings | S3Settings) => Promise<void>;
                              void retry(providerSettings);
                            }}
                          >
                            重试
                          </button>
                        )}
                      </div>
                    )}

                    <div className="cloud-card-actions">
                      <button
                        type="button"
                        className="cloud-card-action"
                        disabled={!providerEnabled}
                        onClick={() => viewAllBackups(provider)}
                      >
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" /></svg>
                        查看全部备份
                      </button>
                      <button
                        type="button"
                        className="cloud-card-action"
                        onClick={onOpenSettings}
                      >
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4" /></svg>
                        设置
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── 全局历史弹窗 ─── */}
      {globalHistoryProvider && (
        <WebDavHistoryDialog
          open
          mode="global"
          provider={globalHistoryProvider}
          settings={globalHistoryProvider === 's3' ? s3Settings : settings}
          onClose={() => setGlobalHistoryProvider(null)}
        />
      )}
    </>
  );
}

function formatClock(timestamp: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
