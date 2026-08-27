import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('wrapped editor does not reserve or display horizontal scrolling', async () => {
  let options: {
    scrollBeyondLastColumn?: number;
    scrollbar?: { horizontal?: string; vertical?: string; useShadows?: boolean; horizontalScrollbarSize?: number; verticalScrollbarSize?: number; verticalSliderSize?: number };
  } = {};

  try {
    ({ EDITOR_OVERFLOW_OPTIONS: options } = await import('../src/utils/editorLayout.ts'));
  } catch {
    // The assertion below provides the intended regression failure when the
    // shared editor layout policy has not been implemented yet.
  }

  assert.equal(options.scrollBeyondLastColumn, 0);
  assert.equal(options.scrollbar?.horizontal, 'hidden');
  assert.equal(options.scrollbar?.vertical, 'auto');
  assert.equal(options.scrollbar?.useShadows, false);
  assert.equal(options.scrollbar?.horizontalScrollbarSize, 0);
  assert.equal(options.scrollbar?.verticalScrollbarSize, 10);
  assert.equal(options.scrollbar?.verticalSliderSize, 10);
});

test('editor wraps against the viewport without shrinking from rendered font measurements', async () => {
  const source = await readFile(new URL('../src/components/Editor/Editor.tsx', import.meta.url), 'utf8');

  assert.match(source, /wordWrap:\s*'on'/);
  assert.doesNotMatch(source, /wordWrapColumn|fitRenderedText|scheduleTextFit/);
});

test('editor synchronizes the preview after the pointer selection gesture finishes', async () => {
  const source = await readFile(new URL('../src/components/Editor/Editor.tsx', import.meta.url), 'utf8');

  assert.match(source, /editor\.onMouseUp\(\(event\)\s*=>/);
  assert.doesNotMatch(source, /editor\.onMouseDown\(\(event\)\s*=>\s*\{\s*const lineNumber/);
});

test('editor does not cover scrolled content with Monaco sticky headings', async () => {
  const source = await readFile(new URL('../src/components/Editor/Editor.tsx', import.meta.url), 'utf8');

  assert.match(source, /stickyScroll:\s*\{\s*enabled:\s*false\s*\}/);
});

test('editor scrolls instantly while split-view sync stays immediate', async () => {
  const source = await readFile(new URL('../src/components/Editor/Editor.tsx', import.meta.url), 'utf8');
  // Monaco 现在按需加载，控制器里的 API 别名是 monacoApi（见 monacoLoader.ts）。
  // 平滑滚动会产生多帧过渡，被用户感知为「输入时文字跳动」，故必须关闭。
  assert.match(source, /smoothScrolling:\s*false/);
  assert.match(source, /editor\.setScrollTop\(top, monacoApi\.editor\.ScrollType\.Immediate\)/);
});

test('uses the native EditContext backend when WebView2 supports it', async () => {
  const { EDITOR_INPUT_OPTIONS } = await import('../src/utils/editorLayout.ts');
  const source = await readFile(new URL('../src/components/Editor/Editor.tsx', import.meta.url), 'utf8');

  assert.equal(EDITOR_INPUT_OPTIONS?.editContext, true);
  assert.match(source, /\.\.\.EDITOR_INPUT_OPTIONS/);
});

test('keeps Monaco native IME fallback text invisible to global form styles', async () => {
  const css = await readFile(new URL('../src/styles/workbench.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /\.app \.monaco-editor \.ime-text-area\s*\{[^}]*color:\s*transparent\s*!important;[^}]*caret-color:\s*transparent\s*!important;/s,
  );
});

test('suppresses ambiguous Unicode warnings for multilingual documents', async () => {
  const { EDITOR_UNICODE_HIGHLIGHT_OPTIONS } = await import('../src/utils/editorLayout.ts');

  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.nonBasicASCII, false);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.ambiguousCharacters, false);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.allowedLocales?.['zh-hans'], true);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.allowedLocales?.['zh-hant'], true);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.allowedLocales?._os, true);
  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.allowedLocales?._vscode, true);
});

test('continues highlighting suspicious invisible Unicode characters', async () => {
  const { EDITOR_UNICODE_HIGHLIGHT_OPTIONS } = await import('../src/utils/editorLayout.ts');

  assert.equal(EDITOR_UNICODE_HIGHLIGHT_OPTIONS?.invisibleCharacters, true);
});
