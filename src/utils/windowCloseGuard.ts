export interface CloseGuardTab {
  id: string;
  title: string;
  path: string | null;
  modified: boolean;
}

export type UnsavedChangesAction = 'save' | 'discard' | 'cancel';

interface WindowCloseDependencies {
  promptAction: (tabs: CloseGuardTab[]) => Promise<UnsavedChangesAction>;
  chooseSavePath: (tab: CloseGuardTab) => Promise<string | null>;
  saveTab: (tabId: string, path: string) => Promise<void>;
}

export type WindowCloseResult = 'close' | 'stay';

export async function guardWindowClose(
  tabs: CloseGuardTab[],
  dependencies: WindowCloseDependencies,
): Promise<WindowCloseResult> {
  const modifiedTabs = tabs.filter(tab => tab.modified);
  if (modifiedTabs.length === 0) return 'close';

  const action = await dependencies.promptAction(modifiedTabs);
  if (action === 'cancel') return 'stay';
  if (action === 'discard') return 'close';

  try {
    for (const tab of modifiedTabs) {
      const path = tab.path ?? await dependencies.chooseSavePath(tab);
      if (!path) return 'stay';
      await dependencies.saveTab(tab.id, path);
    }
  } catch {
    return 'stay';
  }

  return 'close';
}
