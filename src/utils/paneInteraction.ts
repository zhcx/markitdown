export interface FrameDriver {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
}

export interface LatestFrameTask<T> {
  schedule: (value: T) => void;
  flush: () => void;
  cancel: () => void;
}

export const browserFrameDriver: FrameDriver = {
  request: callback => window.requestAnimationFrame(callback),
  cancel: handle => window.cancelAnimationFrame(handle),
};

export function createLatestFrameTask<T>(
  driver: FrameDriver,
  execute: (value: T) => void,
): LatestFrameTask<T> {
  let frame: number | null = null;
  let pending: T | undefined;
  let hasPending = false;

  const run = () => {
    frame = null;
    if (!hasPending) return;
    const value = pending as T;
    pending = undefined;
    hasPending = false;
    execute(value);
  };

  return {
    schedule(value) {
      pending = value;
      hasPending = true;
      if (frame === null) frame = driver.request(run);
    },
    flush() {
      if (frame !== null) driver.cancel(frame);
      frame = null;
      run();
    },
    cancel() {
      if (frame !== null) driver.cancel(frame);
      frame = null;
      pending = undefined;
      hasPending = false;
    },
  };
}

export function hasMeaningfulPixelDelta(previous: number, next: number, minimum = 1) {
  return Math.abs(next - previous) >= minimum;
}

export interface SplitDragBounds {
  left: number;
  width: number;
}

const MIN_SPLIT_RATIO = 0.1;
const MAX_SPLIT_RATIO = 0.9;

// Maps the pointer's clientX to the editor flex ratio. The bounds are the
// `.main-content` split container, which already sits beside (not around) the
// sidebar, so no sidebar offset is subtracted: the divider must track the
// pointer across the editor+preview flex area only.
export function computeSplitRatio(
  clientX: number,
  bounds: SplitDragBounds,
  dividerWidth: number,
) {
  const availableWidth = Math.max(1, bounds.width - dividerWidth);
  const ratio = (clientX - bounds.left) / availableWidth;
  return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio));
}

export interface DelayDriver {
  schedule: (callback: () => void, delayMs: number) => number;
  cancel: (handle: number) => void;
}

export const browserDelayDriver: DelayDriver = {
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: handle => window.clearTimeout(handle),
};

export function createSuspendableInvalidation(
  driver: DelayDriver,
  refresh: () => void,
  delayMs: number,
) {
  let suspended = false;
  let dirty = false;
  let handle: number | null = null;

  const run = () => {
    handle = null;
    if (suspended || !dirty) return;
    dirty = false;
    refresh();
  };
  const schedule = () => {
    if (suspended || handle !== null || !dirty) return;
    handle = driver.schedule(run, delayMs);
  };

  return {
    invalidate() {
      dirty = true;
      schedule();
    },
    suspend() {
      suspended = true;
      if (handle !== null) driver.cancel(handle);
      handle = null;
    },
    resume() {
      suspended = false;
      schedule();
    },
    dispose() {
      if (handle !== null) driver.cancel(handle);
      handle = null;
      dirty = false;
      suspended = true;
    },
  };
}
