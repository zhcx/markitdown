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
