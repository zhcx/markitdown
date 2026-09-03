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

test('editor uses immediate scrolling so split-view synchronization stays responsive', async () => {
  const source = await readFile(new URL('../src/components/Editor/Editor.tsx', import.meta.url), 'utf8');

  assert.match(source, /smoothScrolling:\s*false/);
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
test('contentFontStack returns a concrete font stack instead of a CSS variable reference', async () => {
  const { contentFontStack } = await import('../src/utils/appearanceSettings.ts');

  // Monaco 的折行测量缓存以 fontFamily 字符串为键。传 'var(--font-content)'
  // 这类 CSS 变量时字符串不随字体变化，更换字体后不会触发重新测量，导致
  // 渲染字体与测量宽度不一致、行文字溢出编辑框；这里必须返回真实字体名。
  assert.equal(contentFontStack('Maple Mono CN'), 'Maple Mono CN, "Microsoft YaHei", sans-serif');
  assert.equal(contentFontStack(''), 'Microsoft YaHei, "Microsoft YaHei", sans-serif');
  assert.equal(contentFontStack(undefined), 'Microsoft YaHei, "Microsoft YaHei", sans-serif');
});

test('editor feeds Monaco a concrete font stack so wrap measurement re-runs on font change', async () => {
  const source = await readFile(new URL('../src/components/Editor/Editor.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /fontFamily:\s*'var\(--font-content\)'/);
  assert.match(source, /fontFamily:\s*contentFontStack\(/);
});

test('editor defaults to the traditional textarea input path to avoid IME top-blink', async () => {
  const editorSource = await readFile(new URL('../src/components/Editor/Editor.tsx', import.meta.url), 'utf8');
  const storeSource = await readFile(new URL('../src/stores/appStore.ts', import.meta.url), 'utf8');

  // WebView2 下原生 EditContext 会把 IME 组合文本绘制到编辑器顶部空白区；
  // 输入引擎由设置控制，默认 'textarea'（传统输入层）配合 main.css 兜底。
  assert.match(
    editorSource,
    /editContext:\s*useAppStore\.getState\(\)\.settings\.editor\.input_engine\s*===\s*'editContext'/,
  );
  assert.match(storeSource, /input_engine:\s*'textarea'/);
  assert.match(editorSource, /accessibilitySupport:\s*'off'/);
});

test('input-carrier fallback hides IME composition text while keeping element geometry', async () => {
  const css = await readFile(new URL('../src/styles/main.css', import.meta.url), 'utf8');

  // 输入承载层兜底是多选择器列表（textarea / textarea.ime-input /
  // .ime-text-area / .native-edit-context），取第一条规则块验证属性。
  const rule = css.match(/\.monaco-host\s+textarea\.inputarea[\s\S]*?\{[^}]*\}/)?.[0] ?? '';
  assert.ok(rule.includes('.ime-input'), 'input-area fallback should cover the .ime-input composition state');
  assert.match(rule, /color:\s*transparent\s*!important;/);
  assert.match(rule, /caret-color:\s*transparent\s*!important;/);
  assert.match(rule, /background:\s*transparent\s*!important;/);
  assert.match(rule, /text-shadow:\s*none\s*!important;/);
  // 兜底必须严格保留元素几何与可见性（绝不修改 font-size、clip、opacity:0 或 pointer-events:none），
  // 避免干扰系统输入法对组合窗锚点坐标与字形边界的探测。
  assert.doesNotMatch(rule, /opacity:\s*0\s*!important/);
  assert.doesNotMatch(rule, /pointer-events:\s*none\s*!important/);
  assert.doesNotMatch(rule, /font-size:\s*0/);
  assert.doesNotMatch(rule, /clip:\s*rect/);
});

test('editor has top padding mask against top blink', async () => {
  const css = await readFile(new URL('../src/styles/main.css', import.meta.url), 'utf8');

  // 顶部 24px 留白区域由 .monaco-editor::before 遮罩防护，
  // 确保当 Monaco 隐藏输入层在折行时回退至 (top: 0, left: 0) 时，
  // 视觉上被完全遮蔽于留白区，且 pointer-events: none 不影响对第 1 行正文的点击交互。
  assert.match(css, /\.monaco-editor::before\s*\{[^}]*height:\s*24px/);
  assert.match(css, /\.monaco-editor::before\s*\{[^}]*z-index:\s*20/);
  assert.match(css, /\.monaco-editor::before\s*\{[^}]*pointer-events:\s*none/);
});
