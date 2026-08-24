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
});

test('block editor surface is not styled as a form input', () => {
  const styles = read('src/components/Editor/BlockEditor.css');
  assert.match(styles, /\.block-editor-content\.ProseMirror[\s\S]*outline:\s*none/);
  assert.match(styles, /white-space:\s*pre-wrap/);
  assert.match(styles, /\.block-editor-container[\s\S]*padding:\s*0/);
});

test('slash block actions are applied as node transformations', () => {
  const editor = read('src/components/Editor/BlockEditor.tsx');
  assert.match(editor, /command\.blockAction/);
  assert.match(editor, /changeCurrentBlockType\(/);
});
