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
