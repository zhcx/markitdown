export const DEFAULT_FONT_SIZE = 14;
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 32;
export const FONT_SIZE_RANGE_THUMB = 18;
export const DEFAULT_LINE_HEIGHT = 1.4;

export function getRangeMarkerGeometry(
  value: number,
  min: number,
  max: number,
  thumbSize: number,
) {
  const ratio = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return {
    progressPercent: Number((ratio * 100).toFixed(4)),
    thumbOffsetPx: Number(((thumbSize / 2) * (1 - 2 * ratio)).toFixed(4)),
  };
}
