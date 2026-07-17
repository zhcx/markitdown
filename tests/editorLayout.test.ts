import test from 'node:test';
import assert from 'node:assert/strict';

test('wrapped editor does not reserve or display horizontal scrolling', async () => {
  let options: {
    scrollBeyondLastColumn?: number;
    scrollbar?: { horizontal?: string; horizontalScrollbarSize?: number };
  } = {};

  try {
    ({ EDITOR_OVERFLOW_OPTIONS: options } = await import('../src/utils/editorLayout.ts'));
  } catch {
    // The assertion below provides the intended regression failure when the
    // shared editor layout policy has not been implemented yet.
  }

  assert.equal(options.scrollBeyondLastColumn, 0);
  assert.equal(options.scrollbar?.horizontal, 'hidden');
  assert.equal(options.scrollbar?.horizontalScrollbarSize, 0);
});

test('allows Chinese locales without disabling ambiguous character detection', async () => {
  const { EDITOR_UNICODE_HIGHLIGHT_OPTIONS } = await import('../src/utils/editorLayout.ts');

  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.nonBasicASCII, false);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.ambiguousCharacters, true);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.allowedLocales?.['zh-hans'], true);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.allowedLocales?.['zh-hant'], true);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.allowedLocales?._os, true);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.allowedLocales?._vscode, true);
});

test('continues highlighting suspicious invisible Unicode characters', async () => {
  const { EDITOR_UNICODE_HIGHLIGHT_OPTIONS } = await import('../src/utils/editorLayout.ts');

  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.invisibleCharacters, true);
});
