import type { EditorMode, MarkdownCapability } from '../types/blockEditor.ts';

export function resolveEditorMode(
  requestedMode: EditorMode,
  capability: MarkdownCapability,
  forcedSource: boolean,
): EditorMode {
  if (forcedSource || requestedMode === 'source' || !capability.supported) return 'source';
  return 'blocks';
}
