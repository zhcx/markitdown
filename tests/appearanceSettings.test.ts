import test from 'node:test';
import assert from 'node:assert/strict';

async function loadAppearanceSettings() {
  try {
    return await import('../src/utils/appearanceSettings.ts');
  } catch {
    return {};
  }
}

test('uses 1.4 as the default content line height', async () => {
  const settings = await loadAppearanceSettings();

  assert.equal(settings.DEFAULT_LINE_HEIGHT, 1.4);
});

test('aligns the default font label with the 14px range thumb center', async () => {
  const settings = await loadAppearanceSettings();
  const geometry = settings.getRangeMarkerGeometry?.(14, 12, 32, 18);

  assert.deepEqual(geometry, {
    progressPercent: 10,
    thumbOffsetPx: 7.2,
  });

  const trackWidth = 1000;
  const thumbCenter = 18 / 2 + 0.1 * (trackWidth - 18);
  const markerPosition = trackWidth * 0.1 + geometry.thumbOffsetPx;
  assert.equal(markerPosition, thumbCenter);
});
