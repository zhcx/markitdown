import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { EditorView } from '@codemirror/view';

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const browserSettingsKey = 'markitdown.browser.settings';
let settingsMutationVersion = 0;

const cacheSettingsForStartup = (settings: Settings) => {
  try {
    localStorage.setItem(browserSettingsKey, JSON.stringify(settings));
  } catch { /* Storage can be unavailable in restricted webviews. */ }
};

export interface Settings {
  appearance: {
    theme: string;
    /** UI chrome font. Older saved settings omit this and fall back to YaHei. */
    ui_font_family?: string;
    font_family: string;
    font_size: number;
    line_height: number;
  };
  editor: {
    auto_save_interval: number;
    spell_check: boolean;
    auto_complete: boolean;
  };
  image_hosting: {
    active_service: string;
    cloudinary: {
      cloud_name: string;
      api_key: string;
      api_secret: string;
      upload_folder?: string;
    };
    picgo: {
      server_url: string;
      use_cli: boolean;
      cli_path?: string;
    };
    s3: {
      provider: string;
      endpoint: string;
      bucket: string;
      region: string;
      access_key: string;
      secret_key: string;
      custom_path?: string;
      use_ssl: boolean;
    };
    local: {
      save_directory: string;
      naming_rule: string;
    };
  };
  export: {
    pdf_margin: number;
    html_template: string;
  };
  web_search: WebSearchSettings;
  ai: {
    enabled: boolean;
    provider: AIProviderId;
    api_key: string;
    api_endpoint: string;
    model: string;
    temperature: number;
    auto_suggest: boolean;
    suggest_delay: number;
    writing_style: 'formal' | 'casual' | 'academic' | 'creative' | 'custom';
    custom_style_prompt: string;
    provider_api_keys: string;
    provider_profiles: string;
  };
}

export interface WebSearchSettings {
  enabled: boolean;
  provider: 'tavily' | 'searxng';
  tavily_api_key: string;
  tavily_search_depth: 'basic' | 'advanced' | 'fast' | 'ultra-fast';
  tavily_include_answer: boolean;
  tavily_max_results: number;
  searxng_url: string;
  searxng_api_key: string;
  searxng_language: string;
  searxng_categories: string;
  searxng_safesearch: number;
  searxng_time_range: string;
  searxng_max_results: number;
}

export type AIProviderId =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'siliconflow'
  | 'mimo'
  | 'volcengine'
  | 'longcat'
  | 'zhipu'
  | 'minimax'
  | 'kimi'
  | 'custom';

export interface AIProviderDefinition {
  id: AIProviderId;
  label: string;
  endpoint: string;
  model: string;
  supportsThinking?: boolean;
}

export interface AIProviderProfile {
  api_key: string;
  api_endpoint: string;
  model: string;
  models?: string[];
}

export const AI_PROVIDER_DEFINITIONS: AIProviderDefinition[] = [
  { id: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic (Claude)', endpoint: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
  { id: 'deepseek', label: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat', supportsThinking: true },
  { id: 'siliconflow', label: '硅基流动 (SiliconFlow)', endpoint: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen3-35B-A3B', supportsThinking: true },
  { id: 'mimo', label: '小米 MiMo', endpoint: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', supportsThinking: true },
  { id: 'volcengine', label: '火山引擎 / 豆包', endpoint: 'https://ark.cn-beijing.volces.com/api/v3', model: 'ep-请输入接入点ID' },
  { id: 'longcat', label: '美团 LongCat', endpoint: 'https://api.longcat.chat/openai/v1', model: 'LongCat-2.0', supportsThinking: true },
  { id: 'zhipu', label: '智谱 AI', endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7', supportsThinking: true },
  { id: 'minimax', label: 'MiniMax', endpoint: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.7', supportsThinking: true },
  { id: 'kimi', label: 'Kimi / Moonshot', endpoint: 'https://api.moonshot.cn/v1', model: 'kimi-k2.5', supportsThinking: true },
  { id: 'custom', label: '自定义 OpenAI 兼容', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
];

export interface Tab {
  id: string;
  title: string;
  path: string | null;
  content: string;
  modified: boolean;
}

export interface TimelineEntry {
  id: string;
  content: string;
  timestamp: number;
  label: string;
  operation: string;
}

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';
export type ConversionStatus = 'idle' | 'converting' | 'success' | 'error';
export type SettingsTab = 'appearance' | 'editor' | 'image' | 'export' | 'ai';

interface AppState {
  content: string;
  mode: 'split' | 'immersive';
  splitRatio: number;
  currentFile: string | null;
  settings: Settings;
  sidebarVisible: boolean;
  sidebarWidth: number;
  outlineVisible: boolean;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  isSaving: boolean;
  wordCount: string;
  activeImageService: 'cloudinary' | 'picgo' | 's3' | 'local';
  editorView: EditorView | null;
  tabs: Tab[];
  activeTabId: string | null;
  timeline: Record<string, TimelineEntry[]>;
  uploadStatus: UploadStatus;
  uploadProgress: number;
  uploadMessage: string;
  conversionStatus: ConversionStatus;
  conversionMessage: string;

  setContent: (content: string) => void;
  setMode: (mode: 'split' | 'immersive') => void;
  setSplitRatio: (ratio: number) => void;
  setCurrentFile: (file: string | null) => void;
  setSettings: (settings: Settings) => void;
  setSidebarVisible: (visible: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setOutlineVisible: (visible: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setActiveImageService: (service: 'cloudinary' | 'picgo' | 's3' | 'local') => void;
  setEditorView: (view: EditorView | null) => void;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  convertDocument: (path: string) => Promise<void>;
  saveFile: (path: string) => Promise<void>;
  updateWordCount: () => void;

  addTab: (tab?: Partial<Tab>) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  updateTabTitle: (id: string, path: string) => void;
  restoreTimelineEntry: (tabId: string, entryId: string) => void;
  deleteTimelineEntry: (tabId: string, entryId: string) => void;
  cleanupTimeline: () => void;
  getActiveTab: () => Tab | undefined;
  setUploadStatus: (status: UploadStatus, progress?: number, message?: string) => void;
  setConversionStatus: (status: ConversionStatus, message?: string) => void;
}

const defaultSettings: Settings = {
  appearance: {
    theme: 'vscode-dark',
    ui_font_family: 'Microsoft YaHei',
    font_family: 'Microsoft YaHei',
    font_size: 16,
    line_height: 1.6,
  },
  editor: {
    auto_save_interval: 30000,
    spell_check: false,
    auto_complete: true,
  },
  image_hosting: {
    active_service: 'local',
    cloudinary: {
      cloud_name: '',
      api_key: '',
      api_secret: '',
      upload_folder: '',
    },
    picgo: {
      server_url: 'http://127.0.0.1:36677',
      use_cli: false,
    },
    s3: {
      provider: 'aliyun-oss',
      endpoint: '',
      bucket: '',
      region: '',
      access_key: '',
      secret_key: '',
      custom_path: '',
      use_ssl: true,
    },
    local: {
      save_directory: './assets/images',
      naming_rule: 'timestamp',
    },
  },
  export: {
    pdf_margin: 20,
    html_template: 'default',
  },
  web_search: {
    enabled: false,
    provider: 'tavily',
    tavily_api_key: '',
    tavily_search_depth: 'basic',
    tavily_include_answer: true,
    tavily_max_results: 5,
    searxng_url: 'http://localhost:8080',
    searxng_api_key: '',
    searxng_language: 'auto',
    searxng_categories: 'general',
    searxng_safesearch: 1,
    searxng_time_range: '',
    searxng_max_results: 5,
  },
  ai: {
    enabled: false,
    provider: 'openai',
    api_key: '',
    api_endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    auto_suggest: false,
    suggest_delay: 2000,
    writing_style: 'formal',
    custom_style_prompt: '',
    provider_api_keys: '{}',
    provider_profiles: '{}',
  },
};

const initialSettings = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(browserSettingsKey) || 'null') as Settings | null;
    return saved || defaultSettings;
  } catch {
    return defaultSettings;
  }
})();

const generateId = () => Math.random().toString(36).substring(2, 9);
const TIMELINE_LIMIT = 40;
const TIMELINE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TIMELINE_CAPTURE_DELAY = 1500;
const timelineCaptureTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingTimelineBaselines = new Map<string, string>();

const formatTimelineText = (text: string) => text
  .replace(/\r?\n/g, '↵')
  .replace(/\t/g, '⇥');

const shortenTimelineLabel = (text: string, limit = 38) => {
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : text;
};

const pruneTimelineEntries = (entries: TimelineEntry[], now = Date.now()) => entries
  .filter(entry => now - entry.timestamp <= TIMELINE_RETENTION_MS)
  .sort((a, b) => b.timestamp - a.timestamp)
  .slice(0, TIMELINE_LIMIT);

const pruneTimeline = (timeline: Record<string, TimelineEntry[]>, now = Date.now()) => Object.fromEntries(
  Object.entries(timeline)
    .map(([tabId, entries]) => [tabId, pruneTimelineEntries(entries, now)] as const)
    .filter(([, entries]) => entries.length > 0),
);

const describeTimelineOperation = (previous: string, next: string) => {
  let prefixLength = 0;
  const sharedLength = Math.min(previous.length, next.length);
  while (prefixLength < sharedLength && previous[prefixLength] === next[prefixLength]) prefixLength += 1;

  let suffixLength = 0;
  while (
    suffixLength < previous.length - prefixLength
    && suffixLength < next.length - prefixLength
    && previous[previous.length - 1 - suffixLength] === next[next.length - 1 - suffixLength]
  ) suffixLength += 1;

  const removed = previous.slice(prefixLength, previous.length - suffixLength);
  const inserted = next.slice(prefixLength, next.length - suffixLength);
  if (removed && inserted) return `替换：${formatTimelineText(removed)} → ${formatTimelineText(inserted)}`;
  if (inserted) return `插入：${formatTimelineText(inserted)}`;
  if (removed) return `删除：${formatTimelineText(removed)}`;
  return '编辑快照';
};

const initialTab: Tab = {
  id: generateId(),
  title: '未命名',
  path: null,
  content: '',
  modified: false,
};

export const useAppStore = create<AppState>((set, get) => ({
  content: '',
  mode: 'split',
  splitRatio: 0.5,
  currentFile: null,
  settings: initialSettings,
  sidebarVisible: true,
  sidebarWidth: 220,
  outlineVisible: false,
  settingsOpen: false,
  settingsTab: 'appearance',
  isSaving: false,
  wordCount: '0 字, 0 字符',
  activeImageService: 'local',
  editorView: null,
  tabs: [initialTab],
  activeTabId: initialTab.id,
  timeline: {},
  uploadStatus: 'idle',
  uploadProgress: 0,
  uploadMessage: '',
  conversionStatus: 'idle',
  conversionMessage: '',

  setContent: (content) => {
    const { activeTabId, tabs } = get();
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (activeTabId && activeTab) {
      if (activeTab.content !== content) {
        if (!pendingTimelineBaselines.has(activeTabId)) {
          pendingTimelineBaselines.set(activeTabId, activeTab.content);
        }
        const pendingTimer = timelineCaptureTimers.get(activeTabId);
        if (pendingTimer) clearTimeout(pendingTimer);
        timelineCaptureTimers.set(activeTabId, setTimeout(() => {
          timelineCaptureTimers.delete(activeTabId);
          const baseline = pendingTimelineBaselines.get(activeTabId);
          pendingTimelineBaselines.delete(activeTabId);
          const { tabs: latestTabs, timeline: latestTimeline } = get();
          const latestTab = latestTabs.find((tab) => tab.id === activeTabId);
          if (baseline === undefined || !latestTab || latestTab.content === baseline) return;

          const operation = describeTimelineOperation(baseline, latestTab.content);
          const now = Date.now();
          const nextTimeline = pruneTimeline(latestTimeline, now);
          set({
            timeline: {
              ...nextTimeline,
              [activeTabId]: pruneTimelineEntries([
                {
                  id: generateId(),
                  content: baseline,
                  timestamp: now,
                  label: shortenTimelineLabel(operation),
                  operation,
                },
                ...(latestTimeline[activeTabId] || []),
              ], now),
            },
          });
        }, TIMELINE_CAPTURE_DELAY));
      }
      set({
        content,
        tabs: tabs.map(tab =>
          tab.id === activeTabId
            ? { ...tab, content, modified: true }
            : tab
        ),
      });
    } else {
      set({ content });
    }
    get().updateWordCount();
  },

  setMode: (mode) => set({ mode }),

  setSplitRatio: (ratio) => set({ splitRatio: Math.max(0.1, Math.min(0.9, ratio)) }),

  setCurrentFile: (file) => set({ currentFile: file }),

  setSettings: (settings) => {
    settingsMutationVersion += 1;
    cacheSettingsForStartup(settings);
    set({ settings });
  },

  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(150, Math.min(400, width)) }),
  setOutlineVisible: (visible) => set({ outlineVisible: visible }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),

  setActiveImageService: (service) => set({ activeImageService: service }),

  setEditorView: (view) => set({ editorView: view }),

  loadSettings: async () => {
    const loadVersion = settingsMutationVersion;
    if (!isTauriRuntime()) {
      try {
        const saved = JSON.parse(localStorage.getItem(browserSettingsKey) || 'null') as Settings | null;
        if (saved && loadVersion === settingsMutationVersion) set({ settings: saved });
      } catch (error) {
        console.warn('Failed to load browser settings:', error);
      }
      return;
    }
    try {
      const settings = await invoke<Settings>('get_settings');
      // Do not let a slow desktop read overwrite a theme/font choice the user
      // made immediately after the window appeared.
      if (loadVersion !== settingsMutationVersion) return;
      cacheSettingsForStartup(settings);
      set({ settings });
    } catch (error) {
      console.error('Failed to load settings:', error);
      if (loadVersion === settingsMutationVersion) set({ settings: defaultSettings });
    }
  },

  saveSettings: async (settings) => {
    settingsMutationVersion += 1;
    cacheSettingsForStartup(settings);
    // Apply the new settings before desktop persistence completes. UI actions
    // such as the activity-bar theme toggle should respond on the same click.
    set({ settings });
    if (!isTauriRuntime()) {
      return;
    }
    try {
      await invoke('save_settings', { settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  openFile: async (path) => {
    try {
      const fileContent = await invoke<string>('get_file_content', { path });
      const { tabs, activeTabId } = get();
      const existingTab = tabs.find(t => t.path === path);

      if (existingTab) {
        set({
          content: existingTab.content,
          currentFile: path,
          activeTabId: existingTab.id,
        });
      } else {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && !activeTab.modified && !activeTab.path) {
          const newTabs = tabs.map(t =>
            t.id === activeTabId
              ? { ...t, content: fileContent, path, title: path.split(/[\\/]/).pop() || path, modified: false }
              : t
          );
          set({
            tabs: newTabs,
            content: fileContent,
            currentFile: path,
            activeTabId,
          });
        } else {
          const newTab: Tab = {
            id: generateId(),
            title: path.split(/[\\/]/).pop() || path,
            path,
            content: fileContent,
            modified: false,
          };
          set({
            tabs: [...tabs, newTab],
            content: fileContent,
            currentFile: path,
            activeTabId: newTab.id,
          });
        }
      }
      get().updateWordCount();
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  },

  convertDocument: async (path) => {
    const sourceName = path.split(/[\\/]/).pop() || path;
    get().setConversionStatus('converting', `正在转换：${sourceName}`);
    try {
      const markdown = await invoke<string>('convert_document', { path });
      const title = sourceName.replace(/\.[^.]+$/, '') + '.md';
      const newTab: Tab = {
        id: generateId(),
        title,
        path: null,
        content: markdown,
        // Converted content has not been saved as a Markdown file yet.
        modified: true,
      };
      const { tabs } = get();
      set({
        tabs: [...tabs, newTab],
        activeTabId: newTab.id,
        content: markdown,
        currentFile: null,
      });
      get().updateWordCount();
      get().setConversionStatus('success', `导入成功：${title}`);
    } catch (error) {
      get().setConversionStatus('error', `导入失败：${String(error)}`);
      throw error;
    }
  },

  saveFile: async (path) => {
    const { content, activeTabId, tabs } = get();
    set({ isSaving: true });
    try {
      await invoke('save_file_content', { path, content });
      const newTabs = tabs.map(t =>
        t.id === activeTabId
          ? { ...t, path, title: path.split(/[\\/]/).pop() || path, modified: false }
          : t
      );
      set({ currentFile: path, isSaving: false, tabs: newTabs });
    } catch (error) {
      console.error('Failed to save file:', error);
      set({ isSaving: false });
    }
  },

  updateWordCount: () => {
    const { content } = get();
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const chars = content.length;
    set({ wordCount: chars > 0 ? `${words} 字, ${chars} 字符` : '0 字, 0 字符' });
  },

  addTab: (tab?: Partial<Tab>) => {
    const { tabs } = get();
    const id = generateId();
    const newTab: Tab = {
      id,
      title: tab?.title || '未命名',
      path: tab?.path || null,
      content: tab?.content || '',
      modified: tab?.modified || false,
    };
    set({
      tabs: [...tabs, newTab],
      activeTabId: id,
      content: newTab.content,
      currentFile: newTab.path,
    });
    get().updateWordCount();
    return id;
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const tabIndex = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);

    if (newTabs.length === 0) {
      const newTab: Tab = {
        id: generateId(),
        title: '未命名',
        path: null,
        content: '',
        modified: false,
      };
      set({ tabs: [newTab], activeTabId: newTab.id, content: '', currentFile: null });
    } else if (id === activeTabId) {
      const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
      const newActiveTab = newTabs[newActiveIndex];
      set({
        tabs: newTabs,
        activeTabId: newActiveTab.id,
        content: newActiveTab.content,
        currentFile: newActiveTab.path,
      });
    } else {
      set({ tabs: newTabs });
    }
    get().updateWordCount();
  },

  setActiveTab: (id) => {
    const { tabs } = get();
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      set({
        activeTabId: id,
        content: tab.content,
        currentFile: tab.path,
      });
      get().updateWordCount();
    }
  },

  updateTabContent: (id, content) => {
    const { tabs } = get();
    set({
      tabs: tabs.map(t =>
        t.id === id ? { ...t, content, modified: true } : t
      ),
    });
  },

  updateTabTitle: (id, path) => {
    const { tabs } = get();
    set({
      tabs: tabs.map(t =>
        t.id === id ? { ...t, path, title: path.split(/[\\/]/).pop() || path, modified: false } : t
      ),
    });
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find(t => t.id === activeTabId);
  },

  setUploadStatus: (status, progress = 0, message = '') => {
    set({
      uploadStatus: status,
      uploadProgress: progress,
      uploadMessage: message,
    });
    if (status === 'success' || status === 'error') {
      setTimeout(() => {
        set({ uploadStatus: 'idle', uploadProgress: 0, uploadMessage: '' });
      }, 3000);
    }
  },

  restoreTimelineEntry: (tabId, entryId) => {
    const { tabs, timeline, activeTabId } = get();
    const entry = timeline[tabId]?.find(item => item.id === entryId);
    const tab = tabs.find(item => item.id === tabId);
    if (!entry || !tab) return;

    const rollbackEntry: TimelineEntry = {
      id: generateId(),
      content: tab.content,
      timestamp: Date.now(),
      label: '回退前快照',
      operation: '回退前快照：保留执行回退之前的完整文档内容。',
    };
    const pendingTimer = timelineCaptureTimers.get(tabId);
    if (pendingTimer) clearTimeout(pendingTimer);
    timelineCaptureTimers.delete(tabId);
    pendingTimelineBaselines.delete(tabId);
    set({
      content: activeTabId === tabId ? entry.content : get().content,
      timeline: {
        ...pruneTimeline(timeline),
        [tabId]: pruneTimelineEntries([rollbackEntry, ...(timeline[tabId] || [])]),
      },
      tabs: tabs.map(item => item.id === tabId ? { ...item, content: entry.content, modified: true } : item),
    });
    get().updateWordCount();
  },

  deleteTimelineEntry: (tabId, entryId) => {
    set(({ timeline }) => {
      const remaining = (timeline[tabId] || []).filter(entry => entry.id !== entryId);
      const nextTimeline = { ...timeline };
      if (remaining.length > 0) nextTimeline[tabId] = remaining;
      else delete nextTimeline[tabId];
      return { timeline: nextTimeline };
    });
  },

  cleanupTimeline: () => set(({ timeline }) => ({ timeline: pruneTimeline(timeline) })),

  setConversionStatus: (status, message = '') => {
    set({ conversionStatus: status, conversionMessage: message });
    if (status === 'success' || status === 'error') {
      setTimeout(() => {
        if (get().conversionStatus === status) {
          set({ conversionStatus: 'idle', conversionMessage: '' });
        }
      }, 4000);
    }
  },
}));
