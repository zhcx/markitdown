import test from 'node:test';
import assert from 'node:assert/strict';
import { blockSchema } from '../src/components/Editor/blockSchema.ts';

test('every block node and inline mark has a DOM serializer for EditorView', () => {
  for (const [name, type] of Object.entries(blockSchema.nodes)) {
    if (name === 'doc' || name === 'text') continue;
    assert.equal(typeof type.spec.toDOM, 'function', `${name} must define toDOM`);
  }
  for (const [name, type] of Object.entries(blockSchema.marks)) {
    assert.equal(typeof type.spec.toDOM, 'function', `${name} must define toDOM`);
  }
});

test('raw Markdown is a text-only top-level block with a safe DOM serializer', () => {
  const raw = blockSchema.nodes.raw_markdown;
  assert.ok(raw);
  assert.equal(raw.spec.group, 'block');
  assert.equal(raw.spec.code, true);
  assert.equal(raw.spec.marks, '');
  const node = raw.create({ kind: 'html' }, blockSchema.text('<b>safe text</b>'));
  assert.deepEqual(raw.spec.toDOM?.(node), [
    'pre',
    { class: 'raw-markdown-block', 'data-raw-markdown-kind': 'html' },
    ['code', 0],
  ]);
});
