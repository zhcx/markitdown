import { useAIStore, type AIEditProposal } from '../stores/aiStore.ts';
import type { EditorController } from '../types/editor.ts';
import type { AIEditorCommandId } from './editorCommandRegistry.ts';

export interface AIEditorCommandServices {
  rewriteSelection: (text: string) => Promise<string>;
  translateText: (text: string) => Promise<string>;
  summarizeText: (text: string) => Promise<string>;
  checkProofread: (text: string, baseOffset: number) => Promise<void>;
  getCompanionSuggestion: (text: string, context?: string) => Promise<void>;
  proposeEdit: (proposal: Omit<AIEditProposal, 'id' | 'createdAt'>) => void;
  showCompanion: (position: { x: number; y: number } | null) => void;
}

export function resolveAICommandTarget(controller: EditorController) {
  const selection = controller.getSelection();
  if (!selection.empty) return { from: selection.from, to: selection.to, text: controller.getText(selection.from, selection.to) };
  const line = controller.lineAt(selection.from);
  return { from: line.from, to: line.to, text: line.text };
}

export async function executeAIEditorCommand(
  id: AIEditorCommandId,
  controller: EditorController,
  services: AIEditorCommandServices,
) {
  const target = resolveAICommandTarget(controller);
  if (!target.text.trim()) return;

  if (id === 'ai-rewrite') {
    const after = await services.rewriteSelection(target.text);
    if (after && after !== target.text) services.proposeEdit({ kind: 'polish', reason: 'AI 改写：优化当前块表达，结果需确认后应用。', before: target.text, after, from: target.from, to: target.to });
    return;
  }
  if (id === 'ai-translate') {
    const result = await services.translateText(target.text);
    const separator = result.indexOf('|||');
    const after = separator >= 0 ? result.slice(separator + 3) : '';
    if (after && after !== target.text) services.proposeEdit({ kind: 'translation', reason: 'AI 翻译：译文需确认后应用。', before: target.text, after, from: target.from, to: target.to });
    return;
  }
  if (id === 'ai-proofread') {
    await services.checkProofread(target.text, target.from);
    return;
  }
  if (id === 'ai-summary') {
    const summary = await services.summarizeText(target.text);
    if (summary) services.proposeEdit({ kind: 'structure', reason: 'AI 摘要：根据当前块提炼，结果需确认后插入。', before: '', after: `\n\n## 摘要\n\n${summary}`, from: target.to, to: target.to });
    return;
  }
  controller.setSelection(target.to);
  services.showCompanion(controller.coordsAtPos(target.to));
  await services.getCompanionSuggestion(target.text);
}

export function runAIEditorCommand(id: AIEditorCommandId, controller: EditorController) {
  const ai = useAIStore.getState();
  return executeAIEditorCommand(id, controller, {
    rewriteSelection: ai.rewriteSelection,
    translateText: ai.translateText,
    summarizeText: ai.summarizeText,
    checkProofread: ai.checkProofread,
    getCompanionSuggestion: ai.getCompanionSuggestion,
    proposeEdit: ai.proposeEdit,
    showCompanion: position => ai.setCompanionVisible(true, position || undefined),
  });
}
