import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { blockSchema } from '../src/components/Editor/blockSchema.ts';
import {
  changeCurrentBlockType,
  deleteCurrentBlock,
  insertBlock,
  moveTopLevelBlock,
  turnInto,
} from '../src/components/Editor/blockCommands.ts';
import { findBlockInputRule } from '../src/components/Editor/blockInputRules.ts';

function paragraph(text: string) {
  return blockSchema.nodes.paragraph.create(null, text ? blockSchema.text(text) : undefined);
}

function stateWithBlocks(...blocks: ReturnType<typeof paragraph>[]) {
  const doc = blockSchema.topNodeType.create(null, blocks);
  return EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 1) });
}

function apply(command: (state: EditorState, dispatch?: (transaction: Transaction) => void) => boolean, state: EditorState) {
  let next: Transaction | undefined;
  assert.equal(command(state, transaction => { next = transaction; }), true);
  return next ? state.apply(next) : state;
}

test('turns the current text block into a heading', () => {
  const next = apply(turnInto('heading', 2), stateWithBlocks(paragraph('Title')));
  assert.equal(next.doc.firstChild?.type.name, 'heading');
  assert.equal(next.doc.firstChild?.attrs.level, 2);
  assert.equal(next.doc.textContent, 'Title');
});

test('changes the current block property while preserving its text', () => {
  const heading = apply(changeCurrentBlockType('heading', { level: 2 }), stateWithBlocks(paragraph('Title')));
  assert.equal(heading.doc.firstChild?.type.name, 'heading');
  assert.equal(heading.doc.firstChild?.attrs.level, 2);
  assert.equal(heading.doc.textContent, 'Title');

  const task = apply(changeCurrentBlockType('task_list'), stateWithBlocks(paragraph('Ship it')));
  assert.equal(task.doc.firstChild?.type.name, 'task_list');
  assert.equal(task.doc.firstChild?.firstChild?.type.name, 'task_item');
  assert.equal(task.doc.textContent, 'Ship it');
});

test('inserts a new block after the current block', () => {
  const next = apply(insertBlock('horizontal_rule'), stateWithBlocks(paragraph('Before')));
  assert.deepEqual(next.doc.content.content.map(node => node.type.name), ['paragraph', 'horizontal_rule', 'paragraph']);
});

test('deleting the last block leaves an empty paragraph', () => {
  const next = apply(deleteCurrentBlock, stateWithBlocks(paragraph('Only')));
  assert.equal(next.doc.childCount, 1);
  assert.equal(next.doc.firstChild?.type.name, 'paragraph');
  assert.equal(next.doc.firstChild?.textContent, '');
});

test('moves only top-level blocks', () => {
  const state = stateWithBlocks(paragraph('A'), paragraph('B'), paragraph('C'));
  const next = apply(moveTopLevelBlock(0, 2), state);
  assert.deepEqual(next.doc.content.content.map(node => node.textContent), ['B', 'C', 'A']);
});

test('recognizes Markdown block input prefixes', () => {
  assert.deepEqual(findBlockInputRule('# '), { kind: 'heading', level: 1 });
  assert.deepEqual(findBlockInputRule('## '), { kind: 'heading', level: 2 });
  assert.deepEqual(findBlockInputRule('- '), { kind: 'bullet_list' });
  assert.deepEqual(findBlockInputRule('1. '), { kind: 'ordered_list', order: 1 });
  assert.deepEqual(findBlockInputRule('- [ ] '), { kind: 'task_list', checked: false });
  assert.deepEqual(findBlockInputRule('- [x] '), { kind: 'task_list', checked: true });
  assert.deepEqual(findBlockInputRule('> '), { kind: 'blockquote' });
  assert.deepEqual(findBlockInputRule('```ts '), { kind: 'code_block', params: 'ts' });
  assert.equal(findBlockInputRule('plain text'), null);
});
