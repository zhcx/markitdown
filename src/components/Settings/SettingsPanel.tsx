import { useState, type CSSProperties } from 'react';
import { AI_PROVIDER_DEFINITIONS, useAppStore, type AIProviderId, type AIProviderProfile, type SettingsTab } from '../../stores/appStore';
import { invoke } from '@tauri-apps/api/core';
import { FontFamilyPicker } from './FontFamilyPicker';
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_RANGE_THUMB,
  getRangeMarkerGeometry,
} from '../../utils/appearanceSettings';

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window;

const parseEmojiList = (value: string) => {
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const values = segmenter ? [...segmenter.segment(value)].map((item) => item.segment) : Array.from(value);
  return [...new Set(values.filter((item) => item.trim() && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(item)))].slice(0, 24);
};

const DEFAULT_FONT_FAMILIES = [
  'Microsoft YaHei', 'Microsoft YaHei UI', 'SimSun', 'SimHei', 'KaiTi', 'FangSong',
  'DengXian', 'Noto Sans SC', 'Noto Serif SC', 'Source Han Sans SC', 'Source Han Serif SC',
  'PingFang SC', 'Hiragino Sans GB', 'Segoe UI', 'Arial', 'Times New Roman', 'Consolas',
];

type LocalFontAccessWindow = Window & {
  queryLocalFonts?: () => Promise<Array<{ family: string }>>;
};

type SettingToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function SettingToggle({ label, description, checked, onChange }: SettingToggleProps) {
  return (
    <div className="setting-item setting-toggle-item">
      <div className="setting-copy">
        <span>{label}</span>
        <small>{description}</small>
      </div>
      <button
        type="button"
        className={`settings-switch ${checked ? 'is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span className="settings-switch-thumb" />
      </button>
    </div>
  );
}

const fetchModelsFromApi = async (apiKey: string, apiEndpoint: string): Promise<string[]> => {
  if (isTauriRuntime()) {
    return invoke<string[]>('fetch_ai_models', { apiKey, apiEndpoint });
  }

  const response = await fetch(`${apiEndpoint.replace(/\/+$/, '')}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`获取模型失败（${response.status}）：${await response.text()}`);
  }

  const payload: unknown = await response.json();
  const data = typeof payload === 'object' && payload !== null && 'data' in payload
    ? (payload as { data?: unknown }).data
    : undefined;
  if (!Array.isArray(data)) throw new Error('模型服务返回了无法识别的数据格式。');

  return data.flatMap(model => {
    if (typeof model === 'string') return [model];
    if (typeof model === 'object' && model !== null && 'id' in model && typeof model.id === 'string') {
      return [model.id];
    }
    return [];
  });
};

function SettingsNavIcon({ type }: { type: SettingsTab }) {
  if (type === 'appearance') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  }
  if (type === 'editor') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.5h7l3 3v12H5zM12 2.5V6h3M7.5 9h5M7.5 12h5M7.5 15h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === 'image') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.8" y="3.5" width="14.4" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="7" cy="7.7" r="1.3" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="m4.5 14 3.4-3.5 2.4 2.1 2.3-2.7 2.9 4.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === 'export') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9M6.7 8.7 10 12l3.3-3.3M4 13v3.5h12V13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === 'web_search') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M2.8 10h14.4M10 2.8c2 2 2 12.4 0 14.4M10 2.8c-2 2-2 12.4 0 14.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
  }
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.6 11.5 7l4.4 1.5-4.4 1.5-1.5 4.4L8.5 10 4.1 8.5 8.5 7zM15.5 13l.7 2 .8.3-.8.3-.7 2-.7-2-.8-.3.8-.3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
}

export function SettingsPanel() {
  const { settings, settingsTab, saveSettings, setSettingsOpen } = useAppStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>(settingsTab);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [fontFamilies, setFontFamilies] = useState(DEFAULT_FONT_FAMILIES);
  const [loadingFonts, setLoadingFonts] = useState(false);
  const [fontNotice, setFontNotice] = useState('可直接输入任意已安装字体名称。');
  const fontSizeGeometry = getRangeMarkerGeometry(
    localSettings.appearance.font_size,
    FONT_SIZE_MIN,
    FONT_SIZE_MAX,
    FONT_SIZE_RANGE_THUMB,
  );
  const defaultFontSizeGeometry = getRangeMarkerGeometry(
    DEFAULT_FONT_SIZE,
    FONT_SIZE_MIN,
    FONT_SIZE_MAX,
    FONT_SIZE_RANGE_THUMB,
  );

  const loadLocalFonts = async () => {
    const queryLocalFonts = (window as LocalFontAccessWindow).queryLocalFonts;
    if (isTauriRuntime()) {
      setLoadingFonts(true);
      try {
        const localFamilies = await invoke<string[]>('get_local_font_families');
        const families = Array.from(new Set([
          ...DEFAULT_FONT_FAMILIES,
          ...localFamilies.filter(Boolean),
        ])).sort((left, right) => left.localeCompare(right, 'zh-CN'));
        setFontFamilies(families);
        setFontNotice(`已读取 ${families.length} 个本机字体，可在下拉建议中选择。`);
      } catch {
        setFontNotice('无法读取系统字体列表；可直接输入已安装字体名称。');
      } finally {
        setLoadingFonts(false);
      }
      return;
    }
    if (!queryLocalFonts) {
      setFontNotice('当前环境不支持读取字体列表；可直接输入已安装字体名称。');
      return;
    }

    setLoadingFonts(true);
    try {
      const localFonts = await queryLocalFonts();
      const families = Array.from(new Set([
        ...DEFAULT_FONT_FAMILIES,
        ...localFonts.map((font) => font.family).filter(Boolean),
      ])).sort((left, right) => left.localeCompare(right, 'zh-CN'));
      setFontFamilies(families);
      setFontNotice(`已读取 ${families.length} 个本机字体，可在下拉建议中选择。`);
    } catch {
      setFontNotice('未获得本机字体访问权限；可直接输入已安装字体名称。');
    } finally {
      setLoadingFonts(false);
    }
  };

  // 解析各服务商保存的 API KEY
  const parseProviderKeys = (): Record<string, string> => {
    try {
      return JSON.parse(localSettings.ai.provider_api_keys || '{}');
    } catch {
      return {};
    }
  };

  const parseProviderProfiles = (): Record<string, AIProviderProfile> => {
    try {
      return JSON.parse(localSettings.ai.provider_profiles || '{}');
    } catch {
      return {};
    }
  };

  const handleSave = async () => {
    // 保存前确保当前 API KEY 已记录到映射中
    const keys = { ...parseProviderKeys(), [localSettings.ai.provider]: localSettings.ai.api_key };
    const profiles = {
      ...parseProviderProfiles(),
      [localSettings.ai.provider]: {
        ...(parseProviderProfiles()[localSettings.ai.provider] || {}),
        api_key: localSettings.ai.api_key,
        api_endpoint: localSettings.ai.api_endpoint,
        model: localSettings.ai.model,
        models: models.length > 0 ? models : parseProviderProfiles()[localSettings.ai.provider]?.models,
      },
    };
    const saveData = {
      ...localSettings,
      ai: { ...localSettings.ai, provider_api_keys: JSON.stringify(keys), provider_profiles: JSON.stringify(profiles) },
    };
    await saveSettings(saveData);
    setSettingsOpen(false);
  };

  const tabs = [
    { id: 'appearance', label: '外观', description: '主题、界面字体与内容显示' },
    { id: 'editor', label: '编辑器', description: '编辑体验与自动保存' },
    { id: 'image', label: '图床', description: '图片上传与存储服务' },
    { id: 'export', label: '导出', description: '文档导出与版式设置' },
    { id: 'ai', label: 'AI 助手', description: '模型、提示与伴写设置' },
    { id: 'web_search', label: '网络搜索', description: '搜索服务与结果偏好' },
  ] as const;
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  const s3Providers = [
    { value: 'aliyun-oss', label: '阿里云OSS' },
    { value: 'aws-s3', label: 'AWS S3' },
    { value: 'tencent-cos', label: '腾讯云COS' },
    { value: 'huawei-obs', label: '华为云OBS' },
    { value: 'minio', label: 'MinIO' },
    { value: 'custom', label: '自定义S3' },
  ];

  return (
    <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <aside className="settings-navigation">
          <div className="settings-navigation-header">
            <button className="close-btn" onClick={() => setSettingsOpen(false)} aria-label="关闭设置">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
            <span>设置</span>
          </div>
          <nav className="settings-tabs" aria-label="设置分类">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <SettingsNavIcon type={tab.id} />
              <span>{tab.label}</span>
            </button>
          ))}
          </nav>
        </aside>

        <section className="settings-main">
          <div className="settings-header">
            <div>
              <h2>{activeTabMeta.label}</h2>
              <p>{activeTabMeta.description}</p>
            </div>
          </div>

        <div className="settings-content">
          {activeTab === 'appearance' && (
            <div className="settings-section">
              <div className="setting-item">
                <label>主题</label>
                <select
                  value={localSettings.appearance.theme}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      appearance: { ...localSettings.appearance, theme: e.target.value },
                    })
                  }
                >
                  <option value="vscode-dark">VS Code Dark Theme</option>
                  <option value="vscode-light">VS Code Light Theme</option>
                  <option value="inkwell-light">Inkwell Light Theme</option>
                  <option value="inkwell-dark">Inkwell Dark Theme</option>
                  <option value="claude-light">Claude Light Theme</option>
                  <option value="claude-dark">Claude Dark Theme</option>
                  <option value="notion-light">Notion Light Theme</option>
                  <option value="notion-dark">Notion Dark Theme</option>
                  <option value="system">跟随系统</option>
                </select>
              </div>
              <div className="setting-item font-setting-item">
                <label>
                  界面字体
                  <small>菜单、工具栏、资源管理器与设置界面</small>
                </label>
                <div className="font-setting-control">
                  <FontFamilyPicker
                    value={localSettings.appearance.ui_font_family || 'Microsoft YaHei'}
                    fontFamilies={fontFamilies}
                    onChange={(v) =>
                      setLocalSettings({
                        ...localSettings,
                        appearance: { ...localSettings.appearance, ui_font_family: v },
                      })
                    }
                    placeholder="输入或选择字体…"
                  />
                  <button type="button" className="font-load-btn" onClick={loadLocalFonts} disabled={loadingFonts}>
                    {loadingFonts ? '读取中…' : '读取本机字体'}
                  </button>
                  <small className="font-setting-notice">{fontNotice}</small>
                </div>
              </div>
              <div className="setting-item font-setting-item">
                <label>
                  内容字体
                  <small>编辑器、预览、AI 对话与校对面板</small>
                </label>
                <div className="font-setting-control">
                  <FontFamilyPicker
                    value={localSettings.appearance.font_family}
                    fontFamilies={fontFamilies}
                    onChange={(v) =>
                      setLocalSettings({
                        ...localSettings,
                        appearance: { ...localSettings.appearance, font_family: v },
                      })
                    }
                    placeholder="输入或选择字体…"
                  />
                </div>
              </div>
              <div className="setting-item setting-range-item">
                <div className="setting-range-header">
                  <div className="setting-copy">
                    <span>字号</span>
                    <small>调整编辑器、预览与 AI 对话的文字大小</small>
                  </div>
                  <output>{localSettings.appearance.font_size}px</output>
                </div>
                <input
                  className="settings-range"
                  type="range"
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  step="1"
                  value={localSettings.appearance.font_size}
                  aria-label="字号"
                  aria-valuetext={`${localSettings.appearance.font_size} 像素`}
                  style={{
                    '--range-progress': `${fontSizeGeometry.progressPercent}%`,
                    '--range-thumb-size': `${FONT_SIZE_RANGE_THUMB}px`,
                  } as CSSProperties}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      appearance: { ...localSettings.appearance, font_size: Number(e.target.value) },
                    })
                  }
                />
                <div
                  className="settings-range-scale"
                  aria-hidden="true"
                  style={{
                    '--range-default-position': `${defaultFontSizeGeometry.progressPercent}%`,
                    '--range-default-offset': `${defaultFontSizeGeometry.thumbOffsetPx}px`,
                  } as CSSProperties}
                >
                  <span>小</span>
                  <span>默认</span>
                  <span>大</span>
                </div>
              </div>
              <div className="setting-item">
                <label>行高</label>
                <input
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="3.0"
                  value={localSettings.appearance.line_height}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      appearance: { ...localSettings.appearance, line_height: parseFloat(e.target.value) },
                    })
                  }
                />
              </div>
            </div>
          )}

          {activeTab === 'editor' && (
            <div className="settings-section">
              <div className="setting-item">
                <label>自动保存间隔 (ms)</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={localSettings.editor.auto_save_interval}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      editor: { ...localSettings.editor, auto_save_interval: parseInt(e.target.value) },
                    })
                  }
                />
              </div>
              <SettingToggle
                label="启用拼写检查"
                description="在编辑时标记可能存在的拼写问题"
                checked={localSettings.editor.spell_check}
                onChange={(checked) => setLocalSettings({
                  ...localSettings,
                  editor: { ...localSettings.editor, spell_check: checked },
                })}
              />
              <SettingToggle
                label="启用自动补全"
                description="根据当前内容提供编辑补全建议"
                checked={localSettings.editor.auto_complete}
                onChange={(checked) => setLocalSettings({
                  ...localSettings,
                  editor: { ...localSettings.editor, auto_complete: checked },
                })}
              />
              <div className="setting-item emoji-favorites-setting">
                <label>
                  常用表情
                  <small>设置 Emoji 选择器顶部显示的常用表情，最多 24 个</small>
                </label>
                <div className="emoji-favorites-control">
                  <input
                    type="text"
                    value={localSettings.editor.favorite_emojis.join(' ')}
                    onChange={(event) => setLocalSettings({
                      ...localSettings,
                      editor: { ...localSettings.editor, favorite_emojis: parseEmojiList(event.target.value) },
                    })}
                    placeholder="😀 👍 ❤️ 🎉 ✅"
                    aria-label="常用表情列表"
                  />
                  <div className="emoji-favorites-preview" aria-label="常用表情预览">
                    {localSettings.editor.favorite_emojis.map((emoji) => <span key={emoji}>{emoji}</span>)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'image' && (
            <div className="settings-section">
              <div className="setting-item">
                <label>图床服务</label>
                <select
                  value={localSettings.image_hosting.active_service}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      image_hosting: { ...localSettings.image_hosting, active_service: e.target.value },
                    })
                  }
                >
                  <option value="local">本地</option>
                  <option value="cloudinary">Cloudinary</option>
                  <option value="picgo">PicGo</option>
                  <option value="s3">S3/OSS</option>
                </select>
              </div>

              {localSettings.image_hosting.active_service === 'cloudinary' && (
                <>
                  <div className="setting-item">
                    <label>Cloud Name</label>
                    <input
                      type="text"
                      value={localSettings.image_hosting.cloudinary.cloud_name}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            cloudinary: { ...localSettings.image_hosting.cloudinary, cloud_name: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>API Key</label>
                    <input
                      type="password"
                      value={localSettings.image_hosting.cloudinary.api_key}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            cloudinary: { ...localSettings.image_hosting.cloudinary, api_key: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>API Secret</label>
                    <input
                      type="password"
                      value={localSettings.image_hosting.cloudinary.api_secret}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            cloudinary: { ...localSettings.image_hosting.cloudinary, api_secret: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>上传文件夹</label>
                    <input
                      type="text"
                      placeholder="例如: blog/images"
                      value={localSettings.image_hosting.cloudinary.upload_folder || ''}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            cloudinary: { ...localSettings.image_hosting.cloudinary, upload_folder: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                </>
              )}

              {localSettings.image_hosting.active_service === 'picgo' && (
                <div className="setting-item">
                  <label>PicGo服务器地址</label>
                  <input
                    type="text"
                    value={localSettings.image_hosting.picgo.server_url}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        image_hosting: {
                          ...localSettings.image_hosting,
                          picgo: { ...localSettings.image_hosting.picgo, server_url: e.target.value },
                        },
                      })
                    }
                  />
                </div>
              )}

              {localSettings.image_hosting.active_service === 's3' && (
                <>
                  <div className="setting-item">
                    <label>服务商</label>
                    <select
                      value={localSettings.image_hosting.s3.provider}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            s3: { ...localSettings.image_hosting.s3, provider: e.target.value },
                          },
                        })
                      }
                    >
                      {s3Providers.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="setting-item">
                    <label>Endpoint</label>
                    <input
                      type="text"
                      placeholder="例如: oss-cn-hangzhou.aliyuncs.com"
                      value={localSettings.image_hosting.s3.endpoint}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            s3: { ...localSettings.image_hosting.s3, endpoint: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>Bucket名称</label>
                    <input
                      type="text"
                      value={localSettings.image_hosting.s3.bucket}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            s3: { ...localSettings.image_hosting.s3, bucket: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>Region</label>
                    <input
                      type="text"
                      placeholder="例如: cn-hangzhou"
                      value={localSettings.image_hosting.s3.region}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            s3: { ...localSettings.image_hosting.s3, region: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>Access Key ID</label>
                    <input
                      type="password"
                      value={localSettings.image_hosting.s3.access_key}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            s3: { ...localSettings.image_hosting.s3, access_key: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>Access Key Secret</label>
                    <input
                      type="password"
                      value={localSettings.image_hosting.s3.secret_key}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            s3: { ...localSettings.image_hosting.s3, secret_key: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>自定义路径</label>
                    <input
                      type="text"
                      placeholder="例如: blog/images"
                      value={localSettings.image_hosting.s3.custom_path || ''}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            s3: { ...localSettings.image_hosting.s3, custom_path: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <SettingToggle
                    label="使用 HTTPS"
                    description="通过加密连接访问 S3 图床服务"
                    checked={localSettings.image_hosting.s3.use_ssl}
                    onChange={(checked) => setLocalSettings({
                      ...localSettings,
                      image_hosting: {
                        ...localSettings.image_hosting,
                        s3: { ...localSettings.image_hosting.s3, use_ssl: checked },
                      },
                    })}
                  />
                </>
              )}

              {localSettings.image_hosting.active_service === 'local' && (
                <>
                  <div className="setting-item">
                    <label>保存目录</label>
                    <input
                      type="text"
                      value={localSettings.image_hosting.local.save_directory}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            local: { ...localSettings.image_hosting.local, save_directory: e.target.value },
                          },
                        })
                      }
                    />
                  </div>
                  <div className="setting-item">
                    <label>命名规则</label>
                    <select
                      value={localSettings.image_hosting.local.naming_rule}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          image_hosting: {
                            ...localSettings.image_hosting,
                            local: { ...localSettings.image_hosting.local, naming_rule: e.target.value },
                          },
                        })
                      }
                    >
                      <option value="timestamp">时间戳</option>
                      <option value="uuid">UUID</option>
                      <option value="original">原始名称</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'export' && (
            <div className="settings-section">
              <div className="setting-item">
                <label>PDF边距 (mm)</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={localSettings.export.pdf_margin}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      export: { ...localSettings.export, pdf_margin: parseFloat(e.target.value) },
                    })
                  }
                />
              </div>
              <div className="setting-item">
                <label>HTML模板</label>
                <select
                  value={localSettings.export.html_template}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      export: { ...localSettings.export, html_template: e.target.value },
                    })
                  }
                >
                  <option value="default">默认</option>
                  <option value="minimal">极简</option>
                  <option value="academic">学术</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="settings-section">
              <SettingToggle
                label="启用 AI 助手"
                description="开启对话、改写、校对与智能伴写能力"
                checked={localSettings.ai.enabled}
                onChange={(checked) => setLocalSettings({
                  ...localSettings,
                  ai: { ...localSettings.ai, enabled: checked },
                })}
              />
              {localSettings.ai.enabled && (
                <>
                  <div className="setting-item">
                    <label>AI服务商</label>
                    <select
                      value={localSettings.ai.provider}
                      onChange={(e) => {
                        const oldProvider = localSettings.ai.provider;
                        const newProvider = e.target.value;

                        // 先保存当前服务商的 API KEY
                        const keys = { ...parseProviderKeys(), [oldProvider]: localSettings.ai.api_key };

                        const definition = AI_PROVIDER_DEFINITIONS.find((item) => item.id === newProvider) || AI_PROVIDER_DEFINITIONS[AI_PROVIDER_DEFINITIONS.length - 1];
                        const profiles = parseProviderProfiles();
                        profiles[oldProvider] = {
                          api_key: localSettings.ai.api_key,
                          api_endpoint: localSettings.ai.api_endpoint,
                          model: localSettings.ai.model,
                          models: profiles[oldProvider]?.models,
                        };
                        const nextProfile = profiles[newProvider] || {
                          api_key: keys[newProvider] || '',
                          api_endpoint: definition.endpoint,
                          model: definition.model,
                        };
                        profiles[newProvider] = nextProfile;
                        // 取出该服务商之前保存的 KEY（如有）
                        setLocalSettings({
                          ...localSettings,
                          ai: {
                            ...localSettings.ai,
                            provider: newProvider as AIProviderId,
                            api_key: nextProfile.api_key,
                            api_endpoint: nextProfile.api_endpoint,
                            model: nextProfile.model,
                            provider_api_keys: JSON.stringify(keys),
                            provider_profiles: JSON.stringify(profiles),
                          },
                        });
                        setModels([]);
                        setFetchError('');
                      }}
                    >
                      {AI_PROVIDER_DEFINITIONS.map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.label}</option>
                      ))}
                      <option value="siliconflow">硅基流动 (SiliconFlow)</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>

                  <div className="setting-item">
                    <label>API密钥</label>
                    <div className="input-with-toggle">
                      <input
                        type={apiKeyVisible ? 'text' : 'password'}
                        value={localSettings.ai.api_key}
                        onChange={(e) => {
                          const newKey = e.target.value;
                          const keys = { ...parseProviderKeys(), [localSettings.ai.provider]: newKey };
                          setLocalSettings({
                            ...localSettings,
                            ai: {
                              ...localSettings.ai,
                              api_key: newKey,
                              provider_api_keys: JSON.stringify(keys),
                            },
                          });
                        }}
                        placeholder="sk-..."
                      />
                      <button
                        className="toggle-visibility-btn"
                        onClick={() => setApiKeyVisible(!apiKeyVisible)}
                        title={apiKeyVisible ? '隐藏' : '显示'}
                      >
                        {apiKeyVisible ? '🙈' : '👁'}
                      </button>
                    </div>
                  </div>

                  <div className="setting-item">
                    <label>API端点</label>
                    <input
                      type="text"
                      value={localSettings.ai.api_endpoint}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          ai: { ...localSettings.ai, api_endpoint: e.target.value },
                        })
                      }
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>

                  <div className="setting-item">
                    <label>模型</label>
                    <div className="model-select-row">
                      <select
                        className="model-select"
                        value={localSettings.ai.model}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            ai: { ...localSettings.ai, model: e.target.value },
                          })
                        }
                      >
                        {models.length > 0 ? (
                          models.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))
                        ) : (
                          <option value={localSettings.ai.model}>{localSettings.ai.model || '请输入模型名称'}</option>
                        )}
                      </select>
                      <button
                        className="fetch-models-btn"
                        onClick={async () => {
                          if (!localSettings.ai.api_key) {
                            setFetchError('请先填写 API 密钥');
                            return;
                          }
                          setFetchingModels(true);
                          setFetchError('');
                          try {
                            const result = await fetchModelsFromApi(
                              localSettings.ai.api_key,
                              localSettings.ai.api_endpoint,
                            );
                            setModels(result);
                            if (result.length > 0) {
                              setLocalSettings({
                                ...localSettings,
                                ai: { ...localSettings.ai, model: result[0] },
                              });
                            }
                          } catch (err: unknown) {
                            setFetchError(String(err));
                          } finally {
                            setFetchingModels(false);
                          }
                        }}
                        disabled={fetchingModels}
                      >
                        {fetchingModels ? '获取中...' : '获取模型列表'}
                      </button>
                    </div>
                    {fetchError && <div className="fetch-error">{fetchError}</div>}
                  </div>

                  <div className="setting-item">
                    <label>温度 (0-1)</label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={localSettings.ai.temperature}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          ai: { ...localSettings.ai, temperature: parseFloat(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <SettingToggle
                    label="自动伴写建议"
                    description="输入停顿后自动生成可选择的续写建议"
                    checked={localSettings.ai.auto_suggest}
                    onChange={(checked) => setLocalSettings({
                      ...localSettings,
                      ai: { ...localSettings.ai, auto_suggest: checked },
                    })}
                  />
                  {localSettings.ai.auto_suggest && (
                    <div className="setting-item">
                      <label>建议延迟 (ms)</label>
                      <input
                        type="number"
                        min="500"
                        max="10000"
                        step="100"
                        value={localSettings.ai.suggest_delay}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            ai: { ...localSettings.ai, suggest_delay: parseInt(e.target.value) },
                          })
                        }
                      />
                    </div>
                  )}
                  <div className="setting-item">
                    <label>写作风格</label>
                    <select
                      value={localSettings.ai.writing_style}
                      onChange={(e) =>
                        setLocalSettings({
                          ...localSettings,
                          ai: { ...localSettings.ai, writing_style: e.target.value as 'formal' | 'casual' | 'academic' | 'creative' | 'custom' },
                        })
                      }
                    >
                      <option value="formal">正式</option>
                      <option value="casual">活泼</option>
                      <option value="academic">学术</option>
                      <option value="creative">创意</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                  {localSettings.ai.writing_style === 'custom' && (
                    <div className="setting-item">
                      <label>自定义风格提示</label>
                      <input
                        type="text"
                        value={localSettings.ai.custom_style_prompt}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            ai: { ...localSettings.ai, custom_style_prompt: e.target.value },
                          })
                        }
                        placeholder="例如：请以幽默风趣的方式..."
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'web_search' && (
            <div className="settings-section">
              <SettingToggle
                label="启用网络搜索"
                description="允许 AI 对话在发送前检索并引用网络资料"
                checked={localSettings.web_search.enabled}
                onChange={(checked) => setLocalSettings({
                  ...localSettings,
                  web_search: { ...localSettings.web_search, enabled: checked },
                })}
              />

              {localSettings.web_search.enabled && (
                <>
                  <div className="setting-item">
                    <label>首选搜索服务</label>
                    <select
                      value={localSettings.web_search.provider}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        web_search: { ...localSettings.web_search, provider: e.target.value as 'tavily' | 'searxng' },
                      })}
                      title="同时配置多个搜索服务时，优先使用此服务"
                    >
                      <option value="tavily">Tavily（优先）</option>
                      <option value="searxng">SearXNG（优先）</option>
                    </select>
                  </div>

                  {localSettings.web_search.provider === 'tavily' ? (
                    <>
                      <div className="setting-item">
                        <label>Tavily API Key</label>
                        <input type="password" value={localSettings.web_search.tavily_api_key} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, tavily_api_key: e.target.value } })} placeholder="tvly-..." />
                      </div>
                      <div className="setting-item">
                        <label>搜索深度</label>
                        <select value={localSettings.web_search.tavily_search_depth} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, tavily_search_depth: e.target.value as 'basic' | 'advanced' | 'fast' | 'ultra-fast' } })}>
                          <option value="basic">Basic</option>
                          <option value="fast">Fast</option>
                          <option value="advanced">Advanced</option>
                          <option value="ultra-fast">Ultra fast</option>
                        </select>
                      </div>
                      <div className="setting-item">
                        <label>最大结果数</label>
                        <input type="number" min="1" max="20" value={localSettings.web_search.tavily_max_results} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, tavily_max_results: Number(e.target.value) } })} />
                      </div>
                      <SettingToggle
                        label="请求摘要答案"
                        description="让 Tavily 同时返回基于搜索结果生成的摘要"
                        checked={localSettings.web_search.tavily_include_answer}
                        onChange={(checked) => setLocalSettings({
                          ...localSettings,
                          web_search: { ...localSettings.web_search, tavily_include_answer: checked },
                        })}
                      />
                    </>
                  ) : (
                    <>
                      <div className="setting-item">
                        <label>SearXNG API 地址</label>
                        <input type="url" value={localSettings.web_search.searxng_url} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, searxng_url: e.target.value } })} placeholder="http://localhost:8080" />
                      </div>
                      <div className="setting-item">
                        <label>SearXNG API Key（可选）</label>
                        <input type="password" value={localSettings.web_search.searxng_api_key} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, searxng_api_key: e.target.value } })} />
                      </div>
                      <div className="setting-item">
                        <label>语言</label>
                        <input type="text" value={localSettings.web_search.searxng_language} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, searxng_language: e.target.value } })} placeholder="auto / zh-CN / en" />
                      </div>
                      <div className="setting-item">
                        <label>分类</label>
                        <input type="text" value={localSettings.web_search.searxng_categories} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, searxng_categories: e.target.value } })} placeholder="general" />
                      </div>
                      <div className="setting-item">
                        <label>安全搜索</label>
                        <select value={localSettings.web_search.searxng_safesearch} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, searxng_safesearch: Number(e.target.value) } })}>
                          <option value={0}>关闭</option><option value={1}>中等</option><option value={2}>严格</option>
                        </select>
                      </div>
                      <div className="setting-item">
                        <label>时间范围</label>
                        <select value={localSettings.web_search.searxng_time_range} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, searxng_time_range: e.target.value } })}>
                          <option value="">不限</option><option value="day">一天</option><option value="month">一个月</option><option value="year">一年</option>
                        </select>
                      </div>
                      <div className="setting-item">
                        <label>最大结果数</label>
                        <input type="number" min="1" max="20" value={localSettings.web_search.searxng_max_results} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, searxng_max_results: Number(e.target.value) } })} />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="cancel-btn" onClick={() => setSettingsOpen(false)}>
            取消
          </button>
          <button className="save-btn" onClick={handleSave}>
            保存
          </button>
        </div>
        </section>
      </div>
    </div>
  );
}
