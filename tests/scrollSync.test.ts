import test from 'node:test';
import assert from 'node:assert/strict';
import { getSyncedScrollTop, syncScrollPosition, type ScrollViewport } from '../src/utils/scrollSync.ts';

function viewport(top: number, height: number, clientHeight: number) {
  let currentTop = top;
  const value: ScrollViewport = {
    getScrollTop: () => currentTop,
    getScrollHeight: () => height,
    getClientHeight: () => clientHeight,
    setScrollTop: (nextTop) => { currentTop = nextTop; },
  };
  return { value, get top() { return currentTop; } };
}

test('synchronizes scroll position through viewport APIs', () => {
  const source = viewport(200, 1000, 200);
  const target = viewport(0, 2000, 400);

  syncScrollPosition(source.value, target.value);

  assert.equal(target.top, 400);
});

test('keeps a non-scrollable target at the top', () => {
  const source = viewport(300, 1000, 400);
  const target = viewport(30, 400, 400);

  syncScrollPosition(source.value, target.value);

  assert.equal(target.top, 0);
});

test('uses document anchors to keep the same section aligned', () => {
  const source = viewport(100, 1000, 200);
  const target = viewport(0, 2000, 400);

  syncScrollPosition(source.value, target.value, [
    { sourceTop: 0, targetTop: 0 },
    { sourceTop: 200, targetTop: 600 },
    { sourceTop: 800, targetTop: 1600 },
  ]);

  assert.equal(target.top, 300);
});

test('always maps the current source bottom to the current target bottom', () => {
  const source = viewport(800, 1000, 200);
  const target = viewport(0, 2400, 400);

  syncScrollPosition(source.value, target.value, [
    { sourceTop: 0, targetTop: 0 },
    { sourceTop: 700, targetTop: 1500 },
  ]);

  assert.equal(target.top, 2000);
});

test('uses cached scroll ranges without reading layout dimensions', () => {
  const source: ScrollViewport = {
    getScrollTop: () => 400,
    getScrollHeight: () => { throw new Error('source layout read'); },
    getClientHeight: () => { throw new Error('source layout read'); },
    setScrollTop: () => undefined,
  };
  const target: ScrollViewport = {
    getScrollTop: () => 0,
    getScrollHeight: () => { throw new Error('target layout read'); },
    getClientHeight: () => { throw new Error('target layout read'); },
    setScrollTop: () => undefined,
  };

  assert.equal(getSyncedScrollTop(source, target, [], { sourceMax: 800, targetMax: 1600 }), 800);
});
