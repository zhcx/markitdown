import type { EditorMode } from '../types/blockEditor.ts';

export interface PersistedTab {
  id: string;
  title: string;
  path: string | null;
  content: string;
  modified: boolean;
  editorMode?: EditorMode;
}

export function applySavedTab<T extends PersistedTab>(
  tabs: T[],
  tabId: string,
  path: string,
  savedContent: string,
): T[] {
  return tabs.map(tab => tab.id === tabId
    ? {
        ...tab,
        path,
        title: path.split(/[\\/]/).pop() || path,
        modified: tab.content !== savedContent,
      }
    : tab);
}
