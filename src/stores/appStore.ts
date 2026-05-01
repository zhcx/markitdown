import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { EditorView } from '@codemirror/view';

export interface Settings {
  appearance: {
    theme: string;
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
}

export interface Tab {
  id: string;
  title: string;
  path: string | null;
  content: string;
  modified: boolean;
}

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface AppState {
  content: string;
  mode: 'split' | 'immersive';
  splitRatio: number;
  currentFile: string | null;
  settings: Settings;
  sidebarVisible: boolean;
  sidebarWidth: number;
  settingsOpen: boolean;
  isSaving: boolean;
  wordCount: string;
  activeImageService: 'cloudinary' | 'picgo' | 's3' | 'local';
  editorView: EditorView | null;
  tabs: Tab[];
  activeTabId: string | null;
  uploadStatus: UploadStatus;
  uploadProgress: number;
  uploadMessage: string;

  setContent: (content: string) => void;
  setMode: (mode: 'split' | 'immersive') => void;
  setSplitRatio: (ratio: number) => void;
  setCurrentFile: (file: string | null) => void;
  setSettings: (settings: Settings) => void;
  setSidebarVisible: (visible: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveImageService: (service: 'cloudinary' | 'picgo' | 's3' | 'local') => void;
  setEditorView: (view: EditorView | null) => void;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  saveFile: (path: string) => Promise<void>;
  updateWordCount: () => void;

  addTab: (tab?: Partial<Tab>) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  updateTabTitle: (id: string, path: string) => void;
  getActiveTab: () => Tab | undefined;
  setUploadStatus: (status: UploadStatus, progress?: number, message?: string) => void;
}

const defaultSettings: Settings = {
  appearance: {
    theme: 'light',
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
};

const generateId = () => Math.random().toString(36).substring(2, 9);

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
  settings: defaultSettings,
  sidebarVisible: true,
  sidebarWidth: 220,
  settingsOpen: false,
  isSaving: false,
  wordCount: '0 words, 0 chars',
  activeImageService: 'local',
  editorView: null,
  tabs: [initialTab],
  activeTabId: initialTab.id,
  uploadStatus: 'idle',
  uploadProgress: 0,
  uploadMessage: '',

  setContent: (content) => {
    const { activeTabId, tabs } = get();
    if (activeTabId) {
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

  setSettings: (settings) => set({ settings }),

  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(150, Math.min(400, width)) }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setActiveImageService: (service) => set({ activeImageService: service }),

  setEditorView: (view) => set({ editorView: view }),

  loadSettings: async () => {
    try {
      const settings = await invoke<Settings>('get_settings');
      set({ settings });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ settings: defaultSettings });
    }
  },

  saveSettings: async (settings) => {
    try {
      await invoke('save_settings', { settings });
      set({ settings });
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
}));