import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Extract the first `prop: <value>` that follows the given selector block. The
// selector must be unique enough to anchor the rule the test cares about.
function readCssValue(css: string, selector: string, prop: string): string | null {
  const anchor = css.indexOf(selector);
  if (anchor === -1) return null;
  const afterSelector = css.slice(anchor);
  const blockStart = afterSelector.indexOf('{');
  if (blockStart === -1) return null;
  const block = afterSelector.slice(blockStart, afterSelector.indexOf('}', blockStart));
  const match = block.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`));
  return match ? match[1].trim() : null;
}

// Read a custom-property declaration like `--name: 31px;` wherever it appears.
function readCssVar(css: string, name: string): string | null {
  const match = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

test('split editor and preview reserve the same mode row and content top inset', () => {
  const app = read('src/App.tsx');
  const editor = read('src/components/Editor/Editor.tsx');
  const blockStyles = read('src/components/Editor/BlockEditor.css');
  const mainStyles = read('src/styles/main.css');

  assert.match(editor, /className="editor-mode-row"[\s\S]*<EditorModeToggle/);
  assert.match(app, /className="preview-mode-row-spacer"/);
  assert.match(mainStyles, /--editor-mode-row-height:\s*31px/);
  assert.match(mainStyles, /--document-content-top-padding:\s*32px/);
  assert.match(mainStyles, /\.preview-mode-row-spacer[\s\S]*var\(--editor-mode-row-height\)/);
  assert.match(mainStyles, /\.preview-workspace-pane \.preview-document[\s\S]*var\(--document-content-top-padding\)/);
  assert.match(blockStyles, /\.block-editor-scroll[\s\S]*var\(--document-content-top-padding/);
});

test('alignment variables resolve to the same numeric heights on both panes', () => {
  const blockStyles = read('src/components/Editor/BlockEditor.css');
  const mainStyles = read('src/styles/main.css');

  // The two shared tokens exist as pixel values.
  const modeRow = readCssVar(mainStyles, '--editor-mode-row-height');
  const topPad = readCssVar(mainStyles, '--document-content-top-padding');
  assert.match(modeRow ?? '', /^\d+px$/);
  assert.match(topPad ?? '', /^\d+px$/);

  // The editor mode row and the preview spacer both use the same token.
  const editorRowHeight = readCssValue(blockStyles, '.editor-mode-row', 'height');
  const editorRowBasis = readCssValue(blockStyles, '.editor-mode-row', 'flex-basis');
  const spacerBlock = readCssValue(mainStyles, '.preview-mode-row-spacer', 'flex') ?? '';
  const spacerHeight = readCssValue(mainStyles, '.preview-mode-row-spacer', 'height');
  for (const value of [editorRowHeight, editorRowBasis, spacerHeight]) {
    assert.match(value ?? '', /var\(--editor-mode-row-height/);
  }
  assert.match(spacerBlock, /var\(--editor-mode-row-height/);

  // Both content surfaces pad their first block from the same top inset.
  const editorPad = readCssValue(blockStyles, '.block-editor-scroll', 'padding') ?? '';
  const previewPadTop = readCssValue(mainStyles, '.preview-workspace-pane .preview-document', 'padding-top');
  assert.match(editorPad, /var\(--document-content-top-padding/);
  assert.match(previewPadTop ?? '', /var\(--document-content-top-padding/);
});

test('pane dragging uses latest-frame scheduling and flushes the final pointer', () => {
  const app = read('src/App.tsx');
  const styles = read('src/styles/main.css');
  assert.match(app, /createLatestFrameTask<PendingPanelDrag>/);
  assert.match(app, /dragFrameTaskRef\.current\?\.schedule\(\{ type, clientX \}\)/);
  assert.match(app, /dragFrameTaskRef\.current\?\.flush\(\)/);
  assert.match(app, /hasMeaningfulPixelDelta/);
  assert.match(app, /window\.addEventListener\('blur', handleMouseUp\)/);
  assert.match(app, /window\.addEventListener\('pointercancel', handleMouseUp\)/);
  assert.doesNotMatch(app, /setSplitRatio\([^)]*\)[\s\S]{0,200}mousemove/iu);
  assert.match(styles, /html\.panel-resizing \.document-pane[\s\S]*contain:\s*layout paint/);
});

test('scroll sync uses one latest-frame task and suspends geometry during panel resize', () => {
  const app = read('src/App.tsx');
  assert.match(app, /createLatestFrameTask<ScrollSyncRequest>/);
  assert.match(app, /createSuspendableInvalidation/);
  assert.match(app, /scrollGeometryControlRef\.current\.suspend\(\)/);
  assert.match(app, /scrollGeometryControlRef\.current\.invalidate\(\)/);
  assert.match(app, /scrollGeometryControlRef\.current\.resume\(\)/);
  assert.match(app, /typeof ResizeObserver === 'undefined'/);
  assert.doesNotMatch(app, /useEffect\([\s\S]*\}, \[mode, editorView, previewScrollElement, previewRenderVersion, splitRatio\]\)/);
});

test('drag suspension survives scroll effect re-runs mid-drag', () => {
  const app = read('src/App.tsx');
  // A panel drag that triggers a scroll-sync effect re-run (e.g. previewRenderVersion
  // bump on a deferred render) must not silently drop the suspension: the effect must
  // re-suspend the fresh invalidation and skip the initial sync while the drag lives.
  assert.match(app, /panelDragActiveRef/);
  assert.match(app, /if\s*\(panelDragActiveRef\.current\)\s*\{[\s\S]*?geometryInvalidation\.suspend\(\)/);
  assert.match(app, /if\s*\(!panelDragActiveRef\.current\)\s*\{[\s\S]*?syncEditorToPreview\(\)/);
});
