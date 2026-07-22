import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeadingAnchorBase } from '../src/utils/headingAnchors.ts';

test('uses leading Arabic chapter numbers for compact table-of-contents links', () => {
  assert.equal(createHeadingAnchorBase('1. 第一章 商品和货币'), '1');
  assert.equal(createHeadingAnchorBase('12、第十二章 分工'), '12');
});

test('maps Chinese chapter numbers to numeric anchors', () => {
  assert.equal(createHeadingAnchorBase('第六章 不变资本和可变资本'), '6');
  assert.equal(createHeadingAnchorBase('第十二章 分工和工场手工业'), '12');
});

test('creates readable anchors for ordinary multilingual headings', () => {
  assert.equal(createHeadingAnchorBase('关键概念解释'), '关键概念解释');
  assert.equal(createHeadingAnchorBase('Getting Started!'), 'getting-started');
});
