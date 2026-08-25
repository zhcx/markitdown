import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLatestFrameTask,
  hasMeaningfulPixelDelta,
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
