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

test('React declares a stable ProseMirror mount instead of appending unmanaged children', () => {
  const source = read('src/components/Editor/BlockEditor.tsx');
  assert.match(source, /ref=\{editorHostRef\}[\s\S]*className="block-editor-content"/);
  assert.doesNotMatch(source, /document\.createElement\('div'\)/);
  assert.doesNotMatch(source, /appendChild\(editorHost\)/);
});

test('BlockEditor keeps the interactive handle out of an aria-hidden overlay', () => {
  const source = read('src/components/Editor/BlockEditor.tsx');
  assert.match(source, /className="block-editor-overlay"/);
  assert.doesNotMatch(source, /className="block-editor-overlay"\s+aria-hidden/);
  assert.match(source, /className="block-handle"\s+aria-label=/);
});

test('BlockEditor construction is mount-scoped and uses the current supported document', () => {
  const source = read('src/components/Editor/BlockEditor.tsx');
  assert.match(source, /const parsedRef = useRef\(parsed\);[\s\S]*parsedRef\.current = parsed/);
  assert.match(source, /const currentParsed = parsedRef\.current;/);
  assert.doesNotMatch(source, /initialParsedRef/);
  assert.match(source, /new EditorView[\s\S]*\}, \[isBlockMode\]\);/);
});

test('BlockEditor refreshes the controller snapshot after external state changes', () => {
  const source = read('src/components/Editor/BlockEditor.tsx');
  assert.match(source, /if \(controller\.getValue\(\) === markdown\) return;/);
  // The external markdown string is passed to syncDocument so the sourceMap
  // stays anchored against the same string the preview derives its
  // [data-source-line] anchors from — never a ProseMirror round-trip.
  assert.match(source, /view\.updateState\(EditorState\.create\(/);
  assert.match(source, /controller\.syncDocument\(markdown\);/);
});

test('an empty new block document shows a visible writing prompt', () => {
  const styles = read('src/components/Editor/BlockEditor.css');
  assert.match(styles, /\.block-editor-content\s*>\s*p:only-child:has\(>\s*br\.ProseMirror-trailingBreak\)::before/);
  assert.match(styles, /content:\s*['"]开始写作/);
  assert.match(styles, /pointer-events:\s*none/);
});
