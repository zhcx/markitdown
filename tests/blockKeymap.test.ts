import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { blockSchema } from '../src/components/Editor/blockSchema.ts';
import { createBlockKeyBindings, insertHardBreak } from '../src/components/Editor/blockKeymap.ts';

function apply(command: ReturnType<typeof createBlockKeyBindings>[string], state: EditorState) {
  let transaction: Transaction | undefined;
  assert.equal(command(state, next => { transaction = next; }), true);
  return transaction ? state.apply(transaction) : state;
}

test('Shift-Enter inserts a hard break inside the current block', () => {
  const paragraph = blockSchema.nodes.paragraph.create(null, blockSchema.text('AB'));
  const doc = blockSchema.nodes.doc.create(null, paragraph);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 2) });
  const next = apply(createBlockKeyBindings()['Shift-Enter'], state);
  assert.equal(next.doc.firstChild?.child(1).type.name, 'hard_break');
});

test('Shift-Enter inserts a newline in a code block without a hard break', () => {
  const codeBlock = blockSchema.nodes.code_block.create(null, blockSchema.text('AB'));
  const doc = blockSchema.nodes.doc.create(null, codeBlock);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 2) });
  let next: EditorState | undefined;
  assert.doesNotThrow(() => { next = apply(createBlockKeyBindings()['Shift-Enter'], state); });
  assert.equal(next?.doc.firstChild?.textContent, 'A\nB');
  assert.equal(next?.doc.firstChild?.childCount, 1);
});

test('hard-break insertion declines a text-only code block', () => {
  const codeBlock = blockSchema.nodes.code_block.create(null, blockSchema.text('AB'));
  const doc = blockSchema.nodes.doc.create(null, codeBlock);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 2) });
  assert.equal(insertHardBreak(state), false);
});

test('Enter splits a paragraph into two paragraphs', () => {
  const paragraph = blockSchema.nodes.paragraph.create(null, blockSchema.text('AB'));
  const doc = blockSchema.nodes.doc.create(null, paragraph);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 2) });
  const next = apply(createBlockKeyBindings().Enter, state);
  assert.equal(next.doc.childCount, 2);
  assert.equal(next.doc.child(0).textContent, 'A');
  assert.equal(next.doc.child(1).textContent, 'B');
});

test('Enter splits bullet and ordered list items', () => {
  const paragraph = blockSchema.nodes.paragraph.create(null, blockSchema.text('AB'));
  for (const list of [
    blockSchema.nodes.bullet_list.create(null, blockSchema.nodes.list_item.create(null, paragraph)),
    blockSchema.nodes.ordered_list.create(null, blockSchema.nodes.list_item.create(null, paragraph)),
  ]) {
    const doc = blockSchema.nodes.doc.create(null, list);
    const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 4) });
    const next = apply(createBlockKeyBindings().Enter, state);
    assert.equal(next.doc.firstChild?.childCount, 2);
    assert.equal(next.doc.firstChild?.child(1).textContent, 'B');
  }
});

test('Enter splits an unchecked task into unchecked tasks', () => {
  const paragraph = blockSchema.nodes.paragraph.create(null, blockSchema.text('AB'));
  const task = blockSchema.nodes.task_item.create({ checked: false }, paragraph);
  const doc = blockSchema.nodes.doc.create(null, blockSchema.nodes.task_list.create(null, task));
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 4) });
  const next = apply(createBlockKeyBindings().Enter, state);
  assert.equal(next.doc.firstChild?.child(0).attrs.checked, false);
  assert.equal(next.doc.firstChild?.child(1).attrs.checked, false);
});

test('Enter splits a checked task into an unchecked new task', () => {
  const paragraph = blockSchema.nodes.paragraph.create(null, blockSchema.text('AB'));
  const task = blockSchema.nodes.task_item.create({ checked: true }, paragraph);
  const doc = blockSchema.nodes.doc.create(null, blockSchema.nodes.task_list.create(null, task));
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 4) });
  const next = apply(createBlockKeyBindings().Enter, state);
  assert.equal(next.doc.firstChild?.child(0).attrs.checked, true);
  assert.equal(next.doc.firstChild?.child(1).attrs.checked, false);
});

test('Backspace converts an empty heading to a paragraph', () => {
  const heading = blockSchema.nodes.heading.create({ level: 2 });
  const doc = blockSchema.nodes.doc.create(null, heading);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 1) });
  const next = apply(createBlockKeyBindings().Backspace, state);
  assert.equal(next.doc.firstChild?.type.name, 'paragraph');
});

test('Backspace converts an empty code block to a paragraph', () => {
  const codeBlock = blockSchema.nodes.code_block.create();
  const doc = blockSchema.nodes.doc.create(null, codeBlock);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 1) });
  const next = apply(createBlockKeyBindings().Backspace, state);
  assert.equal(next.doc.firstChild?.type.name, 'paragraph');
});
