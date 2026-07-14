import { useState } from 'react';
import { AI_PROVIDER_DEFINITIONS, useAppStore, type AIProviderId, type AIProviderProfile, type SettingsTab } from '../../stores/appStore';
import { invoke } from '@tauri-apps/api/core';

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window;

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

export function SettingsPanel() {
  const { settings, settingsTab, saveSettings, setSettingsOpen } = useAppStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>(settingsTab);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState('');

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
    { id: 'appearance', label: '外观' },
    { id: 'editor', label: '编辑器' },
    { id: 'image', label: '图床' },
    { id: 'export', label: '导出' },
    { id: 'ai', label: 'AI助手' },
  ] as const;

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
        <div className="settings-header">
          <h2>设置</h2>
          <button className="close-btn" onClick={() => setSettingsOpen(false)}>×</button>
        </div>

        <div className="settings-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
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
                  <option value="inkwell-light">Inkwell Light Theme</option>
                  <option value="inkwell-dark">Inkwell Dark Theme</option>
                  <option value="claude-light">Claude Light Theme</option>
                  <option value="claude-dark">Claude Dark Theme</option>
                  <option value="notion-light">Notion Light Theme</option>
                  <option value="notion-dark">Notion Dark Theme</option>
                  <option value="system">跟随系统</option>
                </select>
              </div>
              <div className="setting-item">
                <label>字体</label>
                <input
                  type="text"
                  value={localSettings.appearance.font_family}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      appearance: { ...localSettings.appearance, font_family: e.target.value },
                    })
                  }
                />
              </div>
              <div className="setting-item">
                <label>字号</label>
                <input
                  type="number"
                  min="12"
                  max="32"
                  value={localSettings.appearance.font_size}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      appearance: { ...localSettings.appearance, font_size: parseInt(e.target.value) },
                    })
                  }
                />
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
              <div className="setting-item">
                <label>
                  <input
                    type="checkbox"
                    checked={localSettings.editor.spell_check}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        editor: { ...localSettings.editor, spell_check: e.target.checked },
                      })
                    }
                  />
                  启用拼写检查
                </label>
              </div>
              <div className="setting-item">
                <label>
                  <input
                    type="checkbox"
                    checked={localSettings.editor.auto_complete}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        editor: { ...localSettings.editor, auto_complete: e.target.checked },
                      })
                    }
                  />
                  启用自动补全
                </label>
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
                  <div className="setting-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={localSettings.image_hosting.s3.use_ssl}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            image_hosting: {
                              ...localSettings.image_hosting,
                              s3: { ...localSettings.image_hosting.s3, use_ssl: e.target.checked },
                            },
                          })
                        }
                      />
                      使用HTTPS
                    </label>
                  </div>
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
              <div className="setting-item">
                <label>
                  <input
                    type="checkbox"
                    checked={localSettings.ai.enabled}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        ai: { ...localSettings.ai, enabled: e.target.checked },
                      })
                    }
                  />
                  启用AI助手
                </label>
              </div>
              <div className="setting-item">
                <label>
                  <input
                    type="checkbox"
                    checked={localSettings.web_search.enabled}
                    onChange={(e) => setLocalSettings({
                      ...localSettings,
                      web_search: { ...localSettings.web_search, enabled: e.target.checked },
                    })}
                  />
                  启用网络搜索
                </label>
              </div>
              {localSettings.web_search.enabled && (
                <div className="settings-subsection web-search-settings">
                  <div className="setting-item">
                    <label>搜索服务</label>
                    <select
                      value={localSettings.web_search.provider}
                      onChange={(e) => setLocalSettings({
                        ...localSettings,
                        web_search: { ...localSettings.web_search, provider: e.target.value as 'tavily' | 'searxng' },
                      })}
                    >
                      <option value="tavily">Tavily</option>
                      <option value="searxng">SearXNG</option>
                    </select>
                  </div>
                  {localSettings.web_search.provider === 'tavily' ? (
                    <>
                      <div className="setting-item">
                        <label>Tavily API Key</label>
                        <input
                          type="password"
                          value={localSettings.web_search.tavily_api_key}
                          onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, tavily_api_key: e.target.value } })}
                          placeholder="tvly-..."
                        />
                      </div>
                      <div className="setting-item">
                        <label>搜索深度</label>
                        <select
                          value={localSettings.web_search.tavily_search_depth}
                          onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, tavily_search_depth: e.target.value as 'basic' | 'advanced' | 'fast' | 'ultra-fast' } })}
                        >
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
                      <div className="setting-item">
                        <label><input type="checkbox" checked={localSettings.web_search.tavily_include_answer} onChange={(e) => setLocalSettings({ ...localSettings, web_search: { ...localSettings.web_search, tavily_include_answer: e.target.checked } })} /> 请求摘要答案</label>
                      </div>
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
                </div>
              )}
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
                  <div className="setting-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={localSettings.ai.auto_suggest}
                        onChange={(e) =>
                          setLocalSettings({
                            ...localSettings,
                            ai: { ...localSettings.ai, auto_suggest: e.target.checked },
                          })
                        }
                      />
                      自动伴写建议
                    </label>
                  </div>
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
        </div>

        <div className="settings-footer">
          <button className="cancel-btn" onClick={() => setSettingsOpen(false)}>
            取消
          </button>
          <button className="save-btn" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
