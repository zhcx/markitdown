import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Editor host exposes source and block editor modes', () => {
  const source = read('src/components/Editor/Editor.tsx');
  assert.match(source, /SourceEditor/);
  assert.match(source, /BlockEditor/);
  assert.match(source, /parseMarkdown/);
  assert.match(source, /EditorModeToggle/);
});

test('BlockEditor creates a ProseMirror view and publishes Markdown changes', () => {
  const source = read('src/components/Editor/BlockEditor.tsx');
  assert.match(source, /new EditorView/);
  assert.match(source, /dropCursor/);
  assert.match(source, /gapCursor/);
  assert.match(source, /history/);
  assert.match(source, /onMarkdownChange/);
});

test('SourceEditor remains a Markdown Monaco editor', () => {
  const source = read('src/components/Editor/SourceEditor.tsx');
  assert.match(source, /monaco\.editor\.createModel/);
  assert.match(source, /['"]markdown['"]/);
});
