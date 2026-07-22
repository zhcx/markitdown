export interface ScrollViewport {
  getScrollTop: () => number;
  getScrollHeight: () => number;
  getClientHeight: () => number;
  setScrollTop: (top: number) => void;
}

export interface ObservableScrollViewport extends ScrollViewport {
  onScroll: (listener: () => void) => () => void;
}

export interface ScrollAnchor {
  sourceTop: number;
  targetTop: number;
}

export interface ScrollRange {
  sourceMax: number;
  targetMax: number;
}

export function getAlignedScrollTop(
  containerScreenTop: number,
  contentTop: number,
  targetScreenTop: number,
  maxScroll: number,
): number {
  const safeMax = Math.max(0, maxScroll);
  return Math.max(0, Math.min(containerScreenTop + contentTop - targetScreenTop, safeMax));
}

const sortedAnchorCache = new WeakMap<ScrollAnchor[], ScrollAnchor[]>();

function getSortedAnchors(anchors: ScrollAnchor[]): ScrollAnchor[] {
  const cached = sortedAnchorCache.get(anchors);
  if (cached) return cached;
  const sorted = anchors.every((anchor, index) => index === 0 || anchors[index - 1].sourceTop <= anchor.sourceTop)
    ? anchors
    : [...anchors].sort((left, right) => left.sourceTop - right.sourceTop);
  sortedAnchorCache.set(anchors, sorted);
  return sorted;
}

function interpolateAnchors(sourceTop: number, anchors: ScrollAnchor[]): number | null {
  if (anchors.length < 2) return null;
  const sorted = getSortedAnchors(anchors);
  const top = Math.max(sorted[0].sourceTop, Math.min(sourceTop, sorted[sorted.length - 1].sourceTop));
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sorted[middle].sourceTop < top) low = middle + 1;
    else high = middle;
  }
  const upperIndex = low;
  if (upperIndex <= 0) return sorted[0].targetTop;
  const lower = sorted[upperIndex - 1];
  const upper = sorted[upperIndex];
  const span = upper.sourceTop - lower.sourceTop;
  if (span <= 0) return upper.targetTop;
  return lower.targetTop + ((top - lower.sourceTop) / span) * (upper.targetTop - lower.targetTop);
}

export function getSyncedScrollTop(
  source: ScrollViewport,
  target: ScrollViewport,
  anchors: ScrollAnchor[] = [],
  range?: ScrollRange,
): number {
  const sourceMax = range?.sourceMax ?? Math.max(0, source.getScrollHeight() - source.getClientHeight());
  const targetMax = range?.targetMax ?? Math.max(0, target.getScrollHeight() - target.getClientHeight());
  if (sourceMax === 0 || targetMax === 0) return 0;
  const sourceTop = Math.max(0, Math.min(source.getScrollTop(), sourceMax));
  if (sourceTop <= 0.5) return 0;
  if (sourceMax - sourceTop <= 0.5) return targetMax;
  const anchoredTop = interpolateAnchors(sourceTop, anchors);
  if (anchoredTop !== null) return Math.max(0, Math.min(anchoredTop, targetMax));
  return (sourceTop / sourceMax) * targetMax;
}

export function syncScrollPosition(
  source: ScrollViewport,
  target: ScrollViewport,
  anchors: ScrollAnchor[] = [],
): number {
  const top = getSyncedScrollTop(source, target, anchors);
  target.setScrollTop(top);
  return top;
}

export function createElementScrollViewport(element: HTMLElement): ObservableScrollViewport {
  return {
    getScrollTop: () => element.scrollTop,
    getScrollHeight: () => element.scrollHeight,
    getClientHeight: () => element.clientHeight,
    setScrollTop: (top) => { element.scrollTop = top; },
    onScroll: (listener) => {
      element.addEventListener('scroll', listener, { passive: true });
      return () => element.removeEventListener('scroll', listener);
    },
  };
}
