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

function interpolateAnchors(sourceTop: number, anchors: ScrollAnchor[]): number | null {
  if (anchors.length < 2) return null;
  const sorted = [...anchors].sort((left, right) => left.sourceTop - right.sourceTop);
  const top = Math.max(sorted[0].sourceTop, Math.min(sourceTop, sorted[sorted.length - 1].sourceTop));
  let upperIndex = sorted.findIndex((anchor) => anchor.sourceTop >= top);
  if (upperIndex <= 0) return sorted[0].targetTop;
  if (upperIndex < 0) upperIndex = sorted.length - 1;
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
): number {
  const sourceMax = Math.max(0, source.getScrollHeight() - source.getClientHeight());
  const targetMax = Math.max(0, target.getScrollHeight() - target.getClientHeight());
  if (sourceMax === 0 || targetMax === 0) return 0;
  const anchoredTop = interpolateAnchors(source.getScrollTop(), anchors);
  if (anchoredTop !== null) return Math.max(0, Math.min(anchoredTop, targetMax));
  return (source.getScrollTop() / sourceMax) * targetMax;
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
