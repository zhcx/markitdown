import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { S3Settings, WebDavConnectionResult } from '../../types/webdav';

interface S3SettingsProps {
  value: S3Settings;
  onChange: (value: S3Settings) => void;
  onBrowseHistory: () => void;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function S3Settings({ value, onChange, onBrowseHistory }: S3SettingsProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);

  const update = (patch: Partial<S3Settings>) => onChange({ ...value, ...patch });

  // 连接测试要求至少填写端点、存储桶与密钥，避免无意义的请求。
  const canTest =
    value.endpoint.trim() !== '' && value.bucket.trim() !== '' &&
    value.access_key.trim() !== '' && value.secret_key.trim() !== '';

  const testConnection = async () => {
    if (!canTest || testing) return;
    setTesting(true);
    setResult(null);
    try {
      const response = await invoke<WebDavConnectionResult>('s3_test_connection', {
        settings: value,
      });
      setResult({ ok: true, message: response.message });
    } catch (error) {
      setResult({ ok: false, message: String(error).slice(0, 240) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="webdav-settings">
      <div className="setting-item setting-toggle-item">
        <div className="setting-copy">
          <span>启用 S3 云同步</span>
          <small>
            本地保存成功后自动上传到 S3 兼容对象存储（AWS S3、阿里云 OSS、
            腾讯云 COS、MinIO、Cloudflare R2 等），保留最近 20 个不同内容版本。
            云端失败不会影响本地保存。
          </small>
        </div>
        <button
          type="button"
          className={`settings-switch ${value.enabled ? 'is-on' : ''}`}
          role="switch"
          aria-checked={value.enabled}
          aria-label="启用 S3 云同步"
          onClick={() => update({ enabled: !value.enabled })}
        >
          <span className="settings-switch-thumb" />
        </button>
      </div>

      {value.enabled && (
        <>
          <div className="setting-item">
            <label className="setting-label" htmlFor="s3-endpoint">
              服务端点（Endpoint）
            </label>
            <input
              id="s3-endpoint"
              className="setting-input"
              type="url"
              value={value.endpoint}
              placeholder="https://s3.amazonaws.com 或 http://localhost:9000"
              onChange={event => update({ endpoint: event.target.value })}
            />
          </div>

          <div className="setting-item">
            <label className="setting-label" htmlFor="s3-bucket">
              存储桶（Bucket）
            </label>
            <input
              id="s3-bucket"
              className="setting-input"
              type="text"
              value={value.bucket}
              placeholder="my-backup-bucket"
              onChange={event => update({ bucket: event.target.value })}
            />
          </div>

          <div className="setting-item">
            <label className="setting-label" htmlFor="s3-region">
              地域（Region）
            </label>
            <input
              id="s3-region"
              className="setting-input"
              type="text"
              value={value.region}
              placeholder="us-east-1 / cn-hangzhou"
              onChange={event => update({ region: event.target.value })}
            />
          </div>

          <div className="setting-item">
            <label className="setting-label" htmlFor="s3-access-key">
              访问密钥 ID（Access Key）
            </label>
            <input
              id="s3-access-key"
              className="setting-input"
              type="text"
              value={value.access_key}
              autoComplete="off"
              onChange={event => update({ access_key: event.target.value })}
            />
          </div>

          <div className="setting-item">
            <label className="setting-label" htmlFor="s3-secret-key">
              访问密钥（Secret Key）
            </label>
            <div className="webdav-password-row">
              <input
                id="s3-secret-key"
                className="setting-input"
                type={secretVisible ? 'text' : 'password'}
                value={value.secret_key}
                autoComplete="new-password"
                onChange={event => update({ secret_key: event.target.value })}
              />
              <button
                type="button"
                className="webdav-password-toggle"
                aria-label={secretVisible ? '隐藏密钥' : '显示密钥'}
                aria-pressed={secretVisible}
                title={secretVisible ? '隐藏密钥' : '显示密钥'}
                onClick={() => setSecretVisible(visible => !visible)}
              >
                {secretVisible ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div className="setting-item setting-toggle-item">
            <div className="setting-copy">
              <span>路径风格（Path-Style）</span>
              <small>自建 S3 / MinIO 等使用；云端服务通常保持关闭。</small>
            </div>
            <button
              type="button"
              className={`settings-switch ${value.path_style ? 'is-on' : ''}`}
              role="switch"
              aria-checked={value.path_style}
              aria-label="使用路径风格访问 S3"
              onClick={() => update({ path_style: !value.path_style })}
            >
              <span className="settings-switch-thumb" />
            </button>
          </div>

          <div className="setting-item">
            <label className="setting-label" htmlFor="s3-remote-root">
              远端根目录（对象前缀）
            </label>
            <input
              id="s3-remote-root"
              className="setting-input"
              type="text"
              value={value.remote_root}
              onChange={event => update({ remote_root: event.target.value })}
            />
            <p className="setting-hint">凭据仅保存在本地设备，不会上传。</p>
          </div>

          {!isTauriRuntime() && (
            <p className="setting-hint webdav-desktop-only">
              S3 云同步仅在桌面版中可用。
            </p>
          )}

          <div className="setting-item webdav-actions">
            <button
              type="button"
              className="button webdav-action-primary"
              disabled={testing || !canTest}
              title={canTest ? undefined : '请先填写端点、存储桶与访问密钥'}
              onClick={() => void testConnection()}
            >
              {testing && <span className="ai-spinner webdav-action-spinner" aria-hidden="true" />}
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button
              type="button"
              className="button webdav-action-secondary"
              onClick={onBrowseHistory}
            >
              浏览全部备份
            </button>
          </div>

          {result && (
            <p className={`webdav-connection-result ${result.ok ? 'ok' : 'error'}`}>
              {result.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
