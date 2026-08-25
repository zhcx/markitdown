import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('BlockEditor exposes a clickable property handle and property menu', () => {
  const editor = read('src/components/Editor/BlockEditor.tsx');
  assert.match(editor, /BlockPropertyMenu/);
  assert.match(editor, /changeCurrentBlockType/);
  assert.match(editor, /block-handle/);
  assert.match(editor, /block-property-menu/);
  assert.match(editor, /new EditorView\(\{\s*mount:\s*editorHostRef\.current\s*\}/);
  assert.match(editor, /changeBlockTypeAtIndex\(blockPropertyMenu\.index/);
  assert.match(editor, /Decoration\.node/);
  assert.match(editor, /createBlockMetadataPlugin\(\)/);
  assert.doesNotMatch(editor, /node\.dataset\.blockId\s*=/);
});

test('block editor surface is not styled as a form input', () => {
  const styles = read('src/components/Editor/BlockEditor.css');
  assert.match(styles, /\.editor-host[\s\S]*position:\s*relative/);
  assert.match(styles, /\.block-editor-content\.ProseMirror[\s\S]*outline:\s*none/);
  assert.match(styles, /white-space:\s*pre-wrap/);
  assert.match(styles, /\.block-editor-container[\s\S]*padding:\s*0/);
  assert.doesNotMatch(styles, /\.block-editor-content\s*>\s*\*:hover::before/);
});

test('editor mode switch participates in editor layout instead of overlaying window chrome', () => {
  const styles = read('src/components/Editor/BlockEditor.css');
  assert.match(styles, /\.editor-host[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(styles, /\.editor-mode-toggle[\s\S]*position:\s*static/);
});

test('slash block actions are applied as node transformations', () => {
  const editor = read('src/components/Editor/BlockEditor.tsx');
  assert.match(editor, /command\.blockAction/);
  assert.match(editor, /changeCurrentBlockType\(/);
});

test('BlockPropertyMenu consumes registry definitions', () => {
  const menu = read('src/components/Editor/BlockPropertyMenu.tsx');
  assert.match(menu, /commands:\s*EditorCommandDefinition\[\]/);
  assert.doesNotMatch(menu, /const options:/);
});
