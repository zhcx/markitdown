import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEditorMode } from '../src/utils/editorMode.ts';
import { inspectMarkdownCapability } from '../src/utils/markdownBlockCapability.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('unsupported Markdown always resolves to source mode', () => {
  const capability = inspectMarkdownCapability('| A | B |\n|---|---|\n| 1 | 2 |\n');
  assert.equal(resolveEditorMode('blocks', capability, false), 'source');
});

test('a supported document can stay in blocks unless the user forced source mode', () => {
  const capability = inspectMarkdownCapability('# Title\n');
  assert.equal(resolveEditorMode('blocks', capability, false), 'blocks');
  assert.equal(resolveEditorMode('blocks', capability, true), 'source');
  assert.equal(resolveEditorMode('source', capability, false), 'source');
});

test('fallback resolution does not expose document content in its result', () => {
  const capability = inspectMarkdownCapability('<script>secret()</script>\n');
  const mode = resolveEditorMode('blocks', capability, false);
  assert.equal(mode, 'source');
  assert.doesNotMatch(String(mode), /secret/);
});

test('unsupported Markdown is stored before the tab is forced to source mode', () => {
  const editor = read('src/components/Editor/Editor.tsx');
  const handler = editor.match(/const handleUnsupported = useCallback\(\(markdown:\s*string\) => \{[\s\S]*?\}, \[[\s\S]*?\]\);/)?.[0] || '';
  assert.match(handler, /\(markdown:\s*string\)/);
  assert.ok(handler.indexOf('setContent(markdown)') < handler.indexOf('setForcedSourceTabId'));
});

test('equivalent external Markdown does not recreate ProseMirror state', () => {
  const blockEditor = read('src/components/Editor/BlockEditor.tsx');
  const effect = blockEditor.match(/useEffect\(\(\) => \{\s*const view = viewRef\.current;[\s\S]*?parsedExternal[\s\S]*?\}, \[markdown\]\);/)?.[0] || '';
  assert.match(effect, /controller\.getValue\(\)\s*===\s*markdown/);
  assert.ok(effect.indexOf('controller.getValue()') < effect.indexOf('EditorState.create'));
});

test('known unsupported Markdown enters source mode without a persistent fallback notice', () => {
  const editor = read('src/components/Editor/Editor.tsx');
  assert.match(editor, /forcedSourceTabId === activeTabId && \(/);
  assert.doesNotMatch(editor, /!capability\.supported \|\| forcedSourceTabId === activeTabId/);
});

test('confirming source fallback preserves the mounted source editor controller', () => {
  const editor = read('src/components/Editor/Editor.tsx');
  const handler = editor.match(/const switchToSource = useCallback\(\(\) => \{[\s\S]*?\}, \[[\s\S]*?\]\);/)?.[0] || '';
  assert.match(handler, /setForcedSourceTabId\(null\)/);
  assert.doesNotMatch(handler, /setEditorView\(null\)/);
});

test('runtime fallback notice overlays the source editor instead of shrinking it', () => {
  const styles = read('src/components/Editor/BlockEditor.css');
  const noticeRule = styles.match(/\.editor-unsupported-notice\s*\{[\s\S]*?\}/)?.[0] || '';
  assert.match(noticeRule, /position:\s*absolute/);
  assert.match(noticeRule, /margin:\s*0/);
  assert.match(noticeRule, /z-index:\s*\d+/);
});
