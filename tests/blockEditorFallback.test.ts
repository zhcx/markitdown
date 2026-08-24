import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEditorMode } from '../src/utils/editorMode.ts';
import { inspectMarkdownCapability } from '../src/utils/markdownBlockCapability.ts';

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
