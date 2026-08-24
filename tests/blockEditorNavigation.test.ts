import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('block nodes expose stable block and source-line anchors', () => {
  const editor = read('src/components/Editor/BlockEditor.tsx');
  assert.match(editor, /Decoration\.node/);
  assert.match(editor, /'data-block-id':\s*block\.blockId/);
  assert.match(editor, /'data-source-line':\s*String\(block\.lineFrom\)/);
  assert.match(editor, /createBlockMetadataPlugin\(\)/);
});

test('navigation code does not require Monaco-only DOM anchors', () => {
  const app = read('src/App.tsx');
  assert.match(app, /getTopForLineNumber/);
  assert.match(app, /\.lines-content, \.block-editor-content/);
  assert.doesNotMatch(app, /if \(!editorContent\) return;/);
});

test('outline and immersive navigation use the public editor controller', () => {
  const outline = read('src/components/Outline/OutlinePanel.tsx');
  const immersive = read('src/components/Immersive/ImmersiveOutline.tsx');
  assert.match(outline, /editorView\.state\.doc\.line/);
  assert.match(immersive, /editorView\.state\.doc\.line/);
  assert.doesNotMatch(outline + immersive, /monaco/iu);
});
