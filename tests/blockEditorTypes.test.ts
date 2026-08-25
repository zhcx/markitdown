import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_NODE_TYPES, DEFAULT_BLOCK_EDITOR_MODE } from '../src/types/blockEditor.ts';

test('block editor exposes the supported node types', () => {
  assert.deepEqual(BLOCK_NODE_TYPES, [
    'paragraph', 'heading', 'bullet_list', 'ordered_list', 'task_list',
    'blockquote', 'code_block', 'horizontal_rule', 'table', 'image',
  ]);
  assert.equal(DEFAULT_BLOCK_EDITOR_MODE, 'blocks');
});
