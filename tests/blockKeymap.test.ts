import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { blockSchema } from '../src/components/Editor/blockSchema.ts';
import { createBlockKeyBindings } from '../src/components/Editor/blockKeymap.ts';

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

test('Backspace converts an empty heading to a paragraph', () => {
  const heading = blockSchema.nodes.heading.create({ level: 2 });
  const doc = blockSchema.nodes.doc.create(null, heading);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 1) });
  const next = apply(createBlockKeyBindings().Backspace, state);
  assert.equal(next.doc.firstChild?.type.name, 'paragraph');
});
