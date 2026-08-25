import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMarkdownCapability } from '../src/utils/markdownBlockCapability.ts';
import { parseMarkdown, serializeMarkdown } from '../src/utils/markdownBlockCodec.ts';

test('parses the supported basic block subset', () => {
  const source = '# 标题\n\n- [ ] 待办\n\n> 引用\n\n```ts\nconst x = 1;\n```\n';
  const result = parseMarkdown(source);
  assert.equal(result.capability.supported, true);
  assert.deepEqual(result.blockTypes, ['heading', 'task_list', 'blockquote', 'code_block']);
  assert.equal(serializeMarkdown(result.document!), '# 标题\n\n- [ ] 待办\n\n> 引用\n\n```ts\nconst x = 1;\n```\n');
});

test('parses and round-trips standard Markdown tables in block mode', () => {
  const source = '| A | B |\n| :--- | ---: |\n| 1 | 2 |\n';
  const result = parseMarkdown(source);

  assert.equal(result.capability.supported, true);
  assert.equal(result.mode, 'blocks');
  assert.deepEqual(result.blockTypes, ['table']);
  assert.equal(result.document?.firstChild?.type.name, 'table');
  assert.equal(result.document?.firstChild?.firstChild?.firstChild?.attrs.header, true);
  assert.equal(result.document?.firstChild?.firstChild?.firstChild?.attrs.align, 'left');
  assert.equal(result.document?.firstChild?.firstChild?.lastChild?.attrs.align, 'right');
  assert.equal(serializeMarkdown(result.document!), source);
});

test('does not silently change the number of cells in a parsed table', () => {
  const source = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n';
  const result = parseMarkdown(source);
  const table = result.document?.firstChild;
  assert.equal(table?.type.name, 'table');
  assert.deepEqual(table?.content.content.map(row => row.childCount), [2, 2, 2]);
  assert.equal(serializeMarkdown(result.document!), source);
});

test('preserves formulas through raw Markdown blocks', () => {
  const source = '# 保留\n\n$$\nx + y\n$$\n';
  const capability = inspectMarkdownCapability(source);
  assert.equal(capability.supported, true);
  assert.deepEqual(capability.rawKinds, ['math']);
  assert.equal(parseMarkdown(source).mode, 'blocks');
  assert.ok(serializeMarkdown(parseMarkdown(source).document!).includes('$$\nx + y\n$$'));
});

test('treats normal fenced code as structured and Mermaid as raw-compatible', () => {
  assert.equal(inspectMarkdownCapability('```ts\nlet x = 1;\n```').supported, true);
  assert.deepEqual(inspectMarkdownCapability('```mermaid\nflowchart LR\n```').rawKinds, ['mermaid']);
});
