export type WorkspaceMode = 'split' | 'immersive' | 'zen';

export interface ImmersiveWorkspacePolicy {
  active: boolean;
  kind: 'reading' | 'writing' | null;
  showEditorToolbar: boolean;
  showOutline: boolean;
  showChatbox: boolean;
  hideWorkbenchChrome: boolean;
}

export function getImmersiveWorkspacePolicy(
  mode: WorkspaceMode,
  chatbotVisible: boolean,
): ImmersiveWorkspacePolicy {
  const active = mode !== 'split';

  return {
    active,
    kind: mode === 'zen' ? 'writing' : mode === 'immersive' ? 'reading' : null,
    showEditorToolbar: mode === 'zen',
    showOutline: active,
    showChatbox: active && chatbotVisible,
    hideWorkbenchChrome: active,
  };
}
