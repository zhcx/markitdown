import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentMarkdown } from '../src/utils/markdownBlockSegments.ts';

test('segments a mixed Markdown document without changing source order', () => {
  const source = '# Title\n\nText\n\n```mermaid\ngraph LR\nA-->B\n```\n\nAfter\n';
  const segments = segmentMarkdown(source);
  assert.deepEqual(segments.map(segment => [segment.kind, segment.kind === 'raw' ? segment.rawKind : 'structured']), [
    ['structured', 'structured'],
    ['raw', 'mermaid'],
    ['structured', 'structured'],
  ]);
  assert.equal(segments.map(segment => segment.source).join('\n\n') + '\n', source);
});

test('classifies block and inline extension syntax as raw blocks', () => {
  const fixtures = [
    ['$$\nx + y\n$$\n', 'math'],
    ['Text with $x$ inline.\n', 'math'],
    ['<section>raw</section>\n', 'html'],
    ['<details>\n<summary>More</summary>\n</details>\n', 'details'],
    ['Text[^1]\n', 'footnote'],
    ['[^1]: note\n', 'footnote'],
    ['@[video](https://example.com/video)\n', 'video'],
    ['[TOC]\n', 'toc'],
    ['@[custom](opaque)\n', 'unknown'],
  ] as const;
  for (const [source, rawKind] of fixtures) {
    const segment = segmentMarkdown(source)[0];
    assert.equal(segment?.kind, 'raw', source);
    assert.equal(segment?.kind === 'raw' ? segment.rawKind : null, rawKind, source);
  }
});

test('keeps ordinary fenced code structured', () => {
  assert.deepEqual(segmentMarkdown('```ts\nconst x = 1;\n```\n').map(segment => segment.kind), ['structured']);
});
