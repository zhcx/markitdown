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

test('editor mode row keeps its fixed height while the preview uses relative scroll sync', () => {
  const app = read('src/App.tsx');
  const editor = read('src/components/Editor/Editor.tsx');
  const blockStyles = read('src/components/Editor/BlockEditor.css');
  const mainStyles = read('src/styles/main.css');

  assert.match(editor, /className="editor-mode-row"[\s\S]*<EditorModeToggle/);
  assert.match(mainStyles, /--editor-mode-row-height:\s*31px/);
  assert.match(blockStyles, /\.block-editor-scroll[\s\S]*var\(--document-content-top-padding/);
  // The preview pane no longer reserves a mode-row spacer or a forced top
  // inset: line alignment is relative through shared anchors, not absolute.
  assert.doesNotMatch(app, /className="preview-mode-row-spacer"/);
  assert.doesNotMatch(mainStyles, /\.preview-workspace-pane \.preview-document[\s\S]*var\(--document-content-top-padding\)/);
});

test('editor tokens stay pixel-based and the preview no longer forces a top inset', () => {
  const blockStyles = read('src/components/Editor/BlockEditor.css');
  const mainStyles = read('src/styles/main.css');

  // The two shared tokens exist as pixel values.
  const modeRow = readCssVar(mainStyles, '--editor-mode-row-height');
  const topPad = readCssVar(mainStyles, '--document-content-top-padding');
  assert.match(modeRow ?? '', /^\d+px$/);
  assert.match(topPad ?? '', /^\d+px$/);

  // The editor mode row and content top inset both use their shared tokens.
  const editorRowHeight = readCssValue(blockStyles, '.editor-mode-row', 'height');
  const editorRowBasis = readCssValue(blockStyles, '.editor-mode-row', 'flex-basis');
  for (const value of [editorRowHeight, editorRowBasis]) {
    assert.match(value ?? '', /var\(--editor-mode-row-height/);
  }
  const editorPad = readCssValue(blockStyles, '.block-editor-scroll', 'padding') ?? '';
  assert.match(editorPad, /var\(--document-content-top-padding/);

  // The preview pane no longer reserves a mode-row spacer or a top padding:
  // scroll sync relies on relative anchor mapping instead of shared insets.
  assert.equal(readCssValue(mainStyles, '.preview-mode-row-spacer', 'flex'), null);
  assert.equal(readCssValue(mainStyles, '.preview-workspace-pane .preview-document', 'padding-top'), null);
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

test('scroll anchors a content-bottom pair so the panes run out of content together', () => {
  const app = read('src/App.tsx');
  const sync = read('src/utils/scrollSync.ts');
  const preview = read('src/components/Preview/Preview.tsx');
  // The editor reserves a taller tail pad than the preview, so the final
  // anchor pair must be "last content bottom on both panes" instead of
  // relying on raw scroll extents alone.
  assert.match(app, /lastContentBottom/);
  assert.match(app, /lastContentBottom\s*-\s*previewViewport\.getClientHeight\(\), previewMax/);
  // Preview blocks record their last markdown line so both ends of a tall
  // block (code fence, table, wrapped paragraph) get pinned anchors.
  assert.match(preview, /data-source-line-end/);
  assert.match(app, /requestedLines/);
  assert.match(app, /getLineLayouts/);
  // Blocks anchor both their first line top and last line bottom so interior
  // scrolling stays proportional rather than drifting to the next block.
  assert.match(app, /lastLine\s*>\s*firstLine/);
  assert.match(app, /anchors\.push\(\{ sourceTop: firstTop,\s*targetTop \},\s*\{ sourceTop: lastBottom,\s*targetTop: targetBottom \}\)/);
  // Interpolation stays linear between the content-bottom anchor and the end.
  assert.match(sync, /sourceTop\s*-\s*lower\.sourceTop[\s\S]*upper\.targetTop\s*-\s*lower\.targetTop/);
});

test('editor scroll listeners stay passive so scrolling never blocks on the pane', () => {
  const block = read('src/utils/blockEditorController.ts');
  const source = read('src/components/Editor/SourceEditor.tsx');
  // The preview viewport is already passive; the block editor must be too,
  // otherwise its scroll listener is treated as cancellable and the main
  // thread waits on it, which reads as scroll jank.
  assert.match(block, /addEventListener\('scroll', listener,\s*\{\s*passive:\s*true\s*\}\)/);
  assert.match(block, /getLineLayouts/);
  assert.match(source, /getLineLayouts/);
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
