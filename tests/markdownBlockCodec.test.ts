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

test('falls back without rewriting unsupported Markdown', () => {
  const source = '# 保留\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
  const capability = inspectMarkdownCapability(source);
  assert.equal(capability.supported, false);
  assert.deepEqual(capability.unsupported, ['table']);
  assert.equal(parseMarkdown(source).mode, 'source');
  assert.equal(parseMarkdown(source).source, source);
});

test('treats normal fenced code as supported but Mermaid as unsupported', () => {
  assert.equal(inspectMarkdownCapability('```ts\nlet x = 1;\n```').supported, true);
  assert.deepEqual(inspectMarkdownCapability('```mermaid\nflowchart LR\n```').unsupported, ['mermaid']);
});
