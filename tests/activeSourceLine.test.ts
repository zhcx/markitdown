import test from 'node:test';
import assert from 'node:assert/strict';
import { findActiveSourceElement, resolveActiveSourceLine } from '../src/utils/activeSourceLine.ts';

test('maps an editor line to the closest preview block that starts before it', () => {
  assert.equal(resolveActiveSourceLine([1, 4, 9, 14], 11), 9);
});

test('uses the first preview block when the cursor is before every source anchor', () => {
  assert.equal(resolveActiveSourceLine([4, 9], 1), 4);
});

test('handles duplicate, invalid and unsorted source anchors', () => {
  assert.equal(resolveActiveSourceLine([9, Number.NaN, 4, 9, 0], 9), 9);
});

test('returns null when the preview has no usable source anchors', () => {
  assert.equal(resolveActiveSourceLine([], 3), null);
});

test('prefers the outer preview block when nested anchors start on the same line', () => {
  const outer = { dataset: { sourceLine: '7' } } as unknown as HTMLElement;
  const inner = { dataset: { sourceLine: '7' } } as unknown as HTMLElement;
  const root = {
    querySelectorAll: () => [outer, inner],
  } as unknown as ParentNode;

  assert.equal(findActiveSourceElement(root, 7), outer);
});
