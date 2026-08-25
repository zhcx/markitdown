import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlockSourceMap } from '../src/utils/blockSourceMap.ts';
import { parseMarkdown, serializeMarkdown } from '../src/utils/markdownBlockCodec.ts';

test('maps Markdown offsets to the containing block and line', () => {
  const parsed = parseMarkdown('# 标题\n\n正文\n');
  assert.ok(parsed.document);
  const source = serializeMarkdown(parsed.document);
  const map = buildBlockSourceMap(source, parsed.document);
  const paragraph = map.blocks.find(block => block.type === 'paragraph');
  assert.ok(paragraph);
  assert.equal(map.blockForSourceOffset(paragraph.sourceFrom + 1)?.blockId, paragraph.blockId);
  assert.equal(map.sourceOffsetForBlock(paragraph.blockId, 0), paragraph.sourceFrom);
  assert.equal(paragraph.lineFrom, 3);
});

test('clamps block offsets and finds the nearest block at blank lines', () => {
  const parsed = parseMarkdown('A\n\nB\n');
  assert.ok(parsed.document);
  const source = serializeMarkdown(parsed.document);
  const map = buildBlockSourceMap(source, parsed.document);
  const first = map.blocks[0];
  const second = map.blocks[1];
  assert.equal(map.sourceOffsetForBlock(first.blockId, 999), first.sourceTo);
  assert.equal(map.blockForSourceOffset(first.sourceTo + 1)?.blockId, second.blockId);
});

test('maps a raw Markdown block as one top-level source anchor', () => {
  const parsed = parseMarkdown('Before\n\n$$\nx\n$$\n\nAfter\n');
  const raw = parsed.sourceMap?.blocks.find(block => block.type === 'raw_markdown');
  assert.ok(raw);
  assert.equal(raw.lineFrom, 3);
  assert.equal(raw.lineTo, 5);
});
