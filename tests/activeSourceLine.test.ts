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

function sourceElement(line: number, tagName: string, classes: string[] = []) {
  return {
    dataset: { sourceLine: String(line) },
    tagName,
    classList: { contains: (className: string) => classes.includes(className) },
  } as unknown as HTMLElement;
}

test('prefers the whole quote when nested anchors start on the same line', () => {
  const outer = sourceElement(7, 'BLOCKQUOTE');
  const inner = sourceElement(7, 'P');
  const root = {
    querySelectorAll: () => [outer, inner],
  } as unknown as ParentNode;

  assert.equal(findActiveSourceElement(root, 7), outer);
});

test('prefers direct list content without highlighting its nested children', () => {
  const item = sourceElement(7, 'LI');
  const content = sourceElement(7, 'SPAN', ['preview-list-item-content']);
  const childItem = sourceElement(8, 'LI');
  const root = {
    querySelectorAll: () => [item, content, childItem],
  } as unknown as ParentNode;

  assert.equal(findActiveSourceElement(root, 7), content);
});
