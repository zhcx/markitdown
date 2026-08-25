import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSplitRatio,
  createLatestFrameTask,
  createSuspendableInvalidation,
  hasMeaningfulPixelDelta,
  type DelayDriver,
  type FrameDriver,
} from '../src/utils/paneInteraction.ts';

function fakeFrames() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  const driver: FrameDriver = {
    request: callback => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel: id => { callbacks.delete(id); },
  };
  return {
    driver,
    flush: () => {
      const queued = [...callbacks.values()];
      callbacks.clear();
      queued.forEach(callback => callback());
    },
    get size() { return callbacks.size; },
  };
}

test('latest frame task executes only the newest value in one frame', () => {
  const frames = fakeFrames();
  const values: number[] = [];
  const task = createLatestFrameTask<number>(frames.driver, value => values.push(value));

  task.schedule(1);
  task.schedule(2);
  task.schedule(3);

  assert.equal(frames.size, 1);
  frames.flush();
  assert.deepEqual(values, [3]);
});

test('flush applies the last pending value synchronously', () => {
  const frames = fakeFrames();
  const values: number[] = [];
  const task = createLatestFrameTask<number>(frames.driver, value => values.push(value));
  task.schedule(9);
  task.flush();
  frames.flush();
  assert.deepEqual(values, [9]);
});

test('cancel prevents queued work and pixel threshold ignores subpixel noise', () => {
  const frames = fakeFrames();
  const values: number[] = [];
  const task = createLatestFrameTask<number>(frames.driver, value => values.push(value));
  task.schedule(4);
  task.cancel();
  frames.flush();
  assert.deepEqual(values, []);
  assert.equal(hasMeaningfulPixelDelta(100, 100.75), false);
  assert.equal(hasMeaningfulPixelDelta(100, 101), true);
});

function fakeDelays() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  const driver: DelayDriver = {
    schedule: callback => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel: id => { callbacks.delete(id); },
  };
  return {
    driver,
    flush: () => {
      const queued = [...callbacks.values()];
      callbacks.clear();
      queued.forEach(callback => callback());
    },
    get size() { return callbacks.size; },
  };
}

test('suspended invalidation defers all work and resumes once', () => {
  const delays = fakeDelays();
  let refreshes = 0;
  const invalidation = createSuspendableInvalidation(delays.driver, () => { refreshes += 1; }, 80);
  invalidation.suspend();
  invalidation.invalidate();
  invalidation.invalidate();
  delays.flush();
  assert.equal(refreshes, 0);
  invalidation.resume();
  assert.equal(delays.size, 1);
  delays.flush();
  assert.equal(refreshes, 1);
});

test('dispose cancels a pending geometry refresh', () => {
  const delays = fakeDelays();
  let refreshes = 0;
  const invalidation = createSuspendableInvalidation(delays.driver, () => { refreshes += 1; }, 80);
  invalidation.invalidate();
  invalidation.dispose();
  delays.flush();
  assert.equal(refreshes, 0);
});

test('split ratio maps the pointer to the divider relative to main-content bounds', () => {
  // The sidebar is a sibling of `.main-content`, not a child: the divider only
  // sees the editor/preview flex area, so the mapping must NOT subtract a
  // sidebar offset. Bounds = `.main-content` rect, divider width = 7px.
  const bounds = { left: 272, width: 986 };
  const dividerWidth = 7;
  const available = bounds.width - dividerWidth;

  assert.equal(computeSplitRatio(900, bounds, dividerWidth), (900 - bounds.left) / available);
  assert.equal(computeSplitRatio(765, bounds, dividerWidth), (765 - bounds.left) / available);
  assert.equal(computeSplitRatio(762, bounds, dividerWidth), (762 - bounds.left) / available);
});

test('split ratio clamps to the same envelope as the pane flex layout', () => {
  const bounds = { left: 272, width: 986 };
  const dividerWidth = 7;
  assert.equal(computeSplitRatio(100, bounds, dividerWidth), 0.1);
  assert.equal(computeSplitRatio(1258, bounds, dividerWidth), 0.9);
  assert.equal(computeSplitRatio(272, bounds, dividerWidth), 0.1);
  assert.equal(computeSplitRatio(1251, bounds, dividerWidth), 0.9);
});
