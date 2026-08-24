import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from 'prosemirror-state';
import { blockSchema } from '../src/components/Editor/blockSchema.ts';
import { parseMarkdown } from '../src/utils/markdownBlockCodec.ts';
import { createBlockEditorController } from '../src/utils/blockEditorController.ts';

function createHarness(markdown: string) {
  const parsed = parseMarkdown(markdown);
  if (!parsed.document) throw new Error('test document must be block-editable');
  let currentState = EditorState.create({ schema: blockSchema, doc: parsed.document });
  const changes: string[] = [];
  let fallback = false;
  let coordsPosition: number | null = null;
  const dispatch = (transaction: Parameters<typeof currentState.apply>[0]) => {
    currentState = currentState.apply(transaction);
  };
  const updateState = (nextState: EditorState) => {
    currentState = nextState;
  };
  const view = {
    get state() { return currentState; },
    dispatch,
    updateState,
    focus() {},
    coordsAtPos(position: number) {
      coordsPosition = position;
      return { left: 10, right: 20, top: 10, bottom: 30 };
    },
    scrollIntoView() {},
  } as never;
  const root = {
    querySelector() { return null; },
    addEventListener() {},
    removeEventListener() {},
  } as never;
  const controller = createBlockEditorController(view, root, {
    onMarkdownChange: value => changes.push(value),
    onUnsupportedMarkdown: () => { fallback = true; },
    onActiveSourceLine: () => {},
  });
  return {
    controller,
    changes,
    dispatch,
    updateState,
    get state() { return currentState; },
    get coordsPosition() { return coordsPosition; },
    get fallback() { return fallback; },
  };
}

test('exposes block content through the existing EditorController facade', () => {
  const harness = createHarness('Title\n');
  assert.equal(harness.controller.kind, 'blocks');
  assert.equal(harness.controller.getValue(), 'Title\n');
  harness.controller.setSelection(0, 5);
  assert.equal(harness.controller.getText(0, 5), 'Title');
  assert.equal(harness.controller.getSelection().empty, false);
});

test('replaceRange reparses Markdown and notifies the host', () => {
  const harness = createHarness('Title\n');
  harness.controller.replaceRange(0, 5, 'Updated');
  assert.equal(harness.controller.getValue(), 'Updated\n');
  assert.equal(harness.changes.at(-1), 'Updated\n');
  assert.equal(harness.fallback, false);
});

test('external unsupported replacement requests source-mode fallback', () => {
  const harness = createHarness('Title\n');
  harness.controller.replaceRange(0, 6, '| A | B |\n|---|---|\n| 1 | 2 |\n');
  assert.equal(harness.fallback, true);
});

test('syncDocument refreshes controller values after a direct editor transaction', () => {
  const harness = createHarness('Title\n');
  const parsed = parseMarkdown('Title updated\n');
  if (!parsed.document) throw new Error('expected block document');

  harness.dispatch(harness.state.tr.replaceWith(0, harness.state.doc.content.size, parsed.document.content));
  harness.controller.syncDocument();

  assert.equal(harness.controller.getValue(), 'Title updated\n');
  assert.equal(harness.controller.line(1).text, 'Title updated');
  harness.controller.setSelection(0, 6);
  assert.deepEqual(harness.controller.getSelection(), { from: 0, to: 6, empty: false });
  harness.controller.coordsAtPos(6);
  assert.equal(harness.coordsPosition, 7);
});

test('syncDocument refreshes controller values after an external state replacement', () => {
  const harness = createHarness('Original\n');
  const parsed = parseMarkdown('External document\n');
  if (!parsed.document) throw new Error('expected block document');

  harness.updateState(EditorState.create({ schema: blockSchema, doc: parsed.document }));
  harness.controller.syncDocument();

  assert.equal(harness.controller.getValue(), 'External document\n');
  assert.equal(harness.controller.line(1).text, 'External document');
});
