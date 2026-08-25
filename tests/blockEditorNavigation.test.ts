import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('block nodes expose stable block and source-line anchors', () => {
  const editor = read('src/components/Editor/BlockEditor.tsx');
  assert.match(editor, /Decoration\.node/);
  assert.match(editor, /'data-block-id':\s*block\.blockId/);
  assert.match(editor, /'data-source-line':\s*String\(block\.lineFrom\)/);
  assert.match(editor, /createBlockMetadataPlugin\(\)/);
});

test('navigation code does not require Monaco-only DOM anchors', () => {
  const app = read('src/App.tsx');
  assert.match(app, /getTopForLineNumber/);
  assert.match(app, /\.lines-content, \.block-editor-content/);
  assert.doesNotMatch(app, /if \(!editorContent\) return;/);
});

test('outline and immersive navigation use the public editor controller', () => {
  const outline = read('src/components/Outline/OutlinePanel.tsx');
  const immersive = read('src/components/Immersive/ImmersiveOutline.tsx');
  assert.match(outline, /editorView\.state\.doc\.line/);
  assert.match(immersive, /editorView\.state\.doc\.line/);
  assert.doesNotMatch(outline + immersive, /monaco/iu);
});

test('block layout uses adaptive padding and preview highlight stays subtle', () => {
  const blockStyles = read('src/components/Editor/BlockEditor.css');
  const mainStyles = read('src/styles/main.css');
  assert.match(blockStyles, /padding:\s*var\(--document-content-top-padding,\s*32px\)\s+clamp\(20px,\s*4vw,\s*48px\)/);
  assert.match(blockStyles, /max-width:\s*980px/);
  assert.match(mainStyles, /is-active-source-block::before[\s\S]*left:\s*-10px/);
  assert.match(mainStyles, /is-active-source-block::before[\s\S]*width:\s*2px/);
  assert.doesNotMatch(mainStyles, /is-active-source-block[\s\S]*box-shadow:\s*-2px\s+0\s+0/);
});

test('list markers align with paragraph text and keep a clear block-handle gutter', () => {
  const editor = read('src/components/Editor/BlockEditor.tsx');
  const styles = read('src/components/Editor/BlockEditor.css');
  assert.match(
    styles,
    /\.block-editor-content ul,\s*\n\.block-editor-content ol\s*{[\s\S]*padding-inline-start:\s*1\.75em/,
  );
  assert.match(editor, /left:\s*blockRect\.left\s*-\s*rootRect\.left\s*\+\s*root\.scrollLeft\s*-\s*40/);
});

test('raw Markdown blocks expose their kind and a source-preserving visual treatment', () => {
  const editor = read('src/components/Editor/BlockEditor.tsx');
  const styles = read('src/components/Editor/BlockEditor.css');
  assert.match(editor, /node\.type\.name === 'raw_markdown'[\s\S]*data-raw-kind/);
  assert.match(styles, /\.raw-markdown-block[\s\S]*white-space:\s*pre-wrap/);
  assert.match(styles, /\.raw-markdown-block::before[\s\S]*源码保真/);
});
