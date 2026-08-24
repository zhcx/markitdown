import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('block editor documentation names the supported and fallback behavior', () => {
  const docs = read('docs/block-editor.md');
  assert.match(docs, /段落/);
  assert.match(docs, /标题/);
  assert.match(docs, /待办/);
  assert.match(docs, /源码模式/);
  assert.match(docs, /Markdown/);
  assert.match(docs, /表格/);
  assert.match(docs, /Mermaid/);
});

test('README and performance docs mention the hybrid editor', () => {
  assert.match(read('README.md'), /兼容混合块编辑器/);
  const performance = read('docs/performance.md');
  assert.match(performance, /100 KB Markdown/);
  assert.match(performance, /10,000/);
  assert.match(performance, /源码模式/);
});

test('CHANGELOG documents the first block editor release boundary', () => {
  const changelog = read('CHANGELOG.md');
  assert.match(changelog, /块编辑器/);
  assert.match(changelog, /不新增.*格式|不新增文件格式/);
  assert.match(changelog, /WebDAV/);
  assert.match(changelog, /S3/);
});
