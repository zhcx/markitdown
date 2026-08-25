import test from 'node:test';
import assert from 'node:assert/strict';
import type { EditorController } from '../src/types/editor.ts';
import { executeAIEditorCommand } from '../src/utils/aiEditorCommands.ts';
import type { AIEditorCommandServices } from '../src/utils/aiEditorCommands.ts';

function controllerFor(initial: string, from: number, to: number): EditorController {
  let value = initial;
  let selection = { from, to, empty: from === to };
  const lineAt = (offset: number) => {
    const safe = Math.max(0, Math.min(value.length, offset));
    const lineFrom = value.lastIndexOf('\n', Math.max(0, safe - 1)) + 1;
    const nextBreak = value.indexOf('\n', safe);
    const lineTo = nextBreak < 0 ? value.length : nextBreak;
    return { from: lineFrom, to: lineTo, number: value.slice(0, lineFrom).split('\n').length, text: value.slice(lineFrom, lineTo) };
  };
  const controller = {
    kind: 'blocks' as const,
    scrollDOM: {} as HTMLElement,
    getScrollTop: () => 0,
    getScrollHeight: () => 0,
    getClientHeight: () => 0,
    getTopForLineNumber: () => 0,
    setScrollTop: () => undefined,
    onScroll: () => () => undefined,
    getValue: () => value,
    getSelection: () => selection,
    getText: (start: number, end: number) => value.slice(start, end),
    replaceRange: (start: number, end: number, text: string) => { value = value.slice(0, start) + text + value.slice(end); },
    setSelection: (start: number, end = start) => { selection = { from: start, to: end, empty: start === end }; },
    lineAt,
    line: (number: number) => lineAt(value.split('\n').slice(0, Math.max(0, number - 1)).join('\n').length + (number > 1 ? 1 : 0)),
    coordsAtPos: () => ({ left: 10, bottom: 30, x: 10, y: 30 }),
    focus: () => undefined,
    undo: () => undefined,
    redo: () => undefined,
    revealOffset: () => undefined,
    dispatch: () => undefined,
    state: {
      selection: { main: selection },
      sliceDoc: (start: number, end: number) => value.slice(start, end),
      doc: { length: value.length, lines: value.split('\n').length, lineAt, line: (number: number) => controller.line(number) },
      update: spec => spec,
    },
  } satisfies EditorController;
  return controller;
}

function services(overrides: Partial<AIEditorCommandServices> = {}): AIEditorCommandServices {
  return {
    rewriteSelection: async text => text,
    translateText: async text => `${text}|||${text}`,
    summarizeText: async text => text,
    checkProofread: async () => undefined,
    getCompanionSuggestion: async () => undefined,
    proposeEdit: () => undefined,
    showCompanion: () => undefined,
    ...overrides,
  };
}

test('rewrite proposes a diff for the current block when selection is empty', async () => {
  const proposals: unknown[] = [];
  const controller = controllerFor('First\n\nSecond block\n', 8, 8);
  await executeAIEditorCommand('ai-rewrite', controller, services({
    rewriteSelection: async () => 'Second improved',
    proposeEdit: proposal => proposals.push(proposal),
  }));
  assert.deepEqual(proposals, [{
    kind: 'polish',
    reason: 'AI 改写：优化当前块表达，结果需确认后应用。',
    before: 'Second block',
    after: 'Second improved',
    from: 7,
    to: 19,
  }]);
});

test('translate uses the selected range and never writes directly', async () => {
  const proposals: unknown[] = [];
  const controller = controllerFor('Hello world\n', 0, 5);
  await executeAIEditorCommand('ai-translate', controller, services({
    translateText: async () => 'Hello|||你好',
    proposeEdit: proposal => proposals.push(proposal),
  }));
  assert.equal(controller.getValue(), 'Hello world\n');
  assert.equal((proposals[0] as { after: string }).after, '你好');
});
