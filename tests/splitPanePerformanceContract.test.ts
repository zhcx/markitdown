import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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

test('pane dragging uses latest-frame scheduling and flushes the final pointer', () => {
  const app = read('src/App.tsx');
  const styles = read('src/styles/main.css');
  assert.match(app, /createLatestFrameTask<PendingPanelDrag>/);
  assert.match(app, /dragFrameTask\.schedule\(\{ type, clientX \}\)/);
  assert.match(app, /dragFrameTask\.flush\(\)/);
  assert.match(app, /hasMeaningfulPixelDelta/);
  assert.match(app, /window\.addEventListener\('blur', handleMouseUp\)/);
  assert.doesNotMatch(app, /setSplitRatio\([^)]*\)[\s\S]{0,200}mousemove/iu);
  assert.match(styles, /html\.panel-resizing \.document-pane[\s\S]*contain:\s*layout paint/);
});
