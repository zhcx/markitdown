import { create } from 'zustand';
import { unzipSync, strFromU8 } from 'fflate';

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  content: string;
}

interface SkillState {
  skills: SkillInfo[];
  loading: boolean;
  loadSkills: () => Promise<void>;
  importSkillPackage: (path: string) => Promise<void>;
  importSkillFile: (file: File) => Promise<void>;
  setSkillEnabled: (id: string, enabled: boolean) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
}

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window;
const browserSkillsKey = 'markitdown.browser.skills';

const parseSkill = (content: string, fallback: string, id: string, enabled = true): SkillInfo => {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const description = content.match(/^description:\s*(.+)$/im)?.[1]?.trim() || 'Imported MarkitDown skill';
  return { id, name: heading || fallback, description, enabled, content };
};

const saveBrowserSkills = (skills: SkillInfo[]) => {
  localStorage.setItem(browserSkillsKey, JSON.stringify(skills));
};

const readBrowserSkills = (): SkillInfo[] => {
  try {
    const value = JSON.parse(localStorage.getItem(browserSkillsKey) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export const useSkillStore = create<SkillState>((set) => ({
  skills: [],
  loading: false,

  loadSkills: async () => {
    if (!isTauriRuntime()) {
      set({ skills: readBrowserSkills() });
      return;
    }
    set({ loading: true });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      set({ skills: await invoke<SkillInfo[]>('get_skills') });
    } catch (error) {
      console.error('Failed to load skills:', error);
    } finally {
      set({ loading: false });
    }
  },

  importSkillPackage: async (path) => {
    if (!isTauriRuntime()) return;
    set({ loading: true });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      set({ skills: await invoke<SkillInfo[]>('import_skill_package', { packagePath: path }) });
    } finally {
      set({ loading: false });
    }
  },

  importSkillFile: async (file) => {
    if (isTauriRuntime()) return;
    set({ loading: true });
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let content = '';
      let fallback = file.name.replace(/\.(zip|md)$/i, '') || 'Imported Skill';

      if (extension === 'md') {
        content = await file.text();
      } else if (extension === 'zip') {
        const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const skillEntry = Object.entries(files).find(([name]) => name.split('/').pop()?.toLowerCase() === 'skill.md');
        if (!skillEntry) throw new Error('Skill 包中未找到 SKILL.md');
        content = strFromU8(skillEntry[1]);
        fallback = skillEntry[0].split('/').at(-2) || fallback;
      } else {
        throw new Error('仅支持 .zip Skill 包或 SKILL.md');
      }

      if (!content.trim()) throw new Error('SKILL.md 内容为空');
      const id = `browser-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      const nextSkills = [...readBrowserSkills(), parseSkill(content, fallback, id)];
      saveBrowserSkills(nextSkills);
      set({ skills: nextSkills });
    } finally {
      set({ loading: false });
    }
  },

  setSkillEnabled: async (id, enabled) => {
    if (!isTauriRuntime()) {
      const nextSkills = readBrowserSkills().map((skill) => skill.id === id ? { ...skill, enabled } : skill);
      saveBrowserSkills(nextSkills);
      set({ skills: nextSkills });
      return;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    set({ skills: await invoke<SkillInfo[]>('set_skill_enabled', { id, enabled }) });
  },

  deleteSkill: async (id) => {
    if (!isTauriRuntime()) {
      const nextSkills = readBrowserSkills().filter((skill) => skill.id !== id);
      saveBrowserSkills(nextSkills);
      set({ skills: nextSkills });
      return;
    }
    const { invoke } = await import('@tauri-apps/api/core');
    set({ skills: await invoke<SkillInfo[]>('delete_skill', { id }) });
  },
}));
