import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('desktop close requests inspect all tabs and only destroy after the close guard allows it', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.match(source, /onCloseRequested/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /guardWindowClose\(useAppStore\.getState\(\)\.tabs/);
  assert.match(source, /result === 'close'[\s\S]*?\.destroy\(\)/);
});

test('tab-specific save persists the selected tab content', async () => {
  const source = await readFile(new URL('../src/stores/appStore.ts', import.meta.url), 'utf8');

  assert.match(source, /saveTab:\s*async\s*\(tabId, path\)/);
  assert.match(source, /save_file_content[\s\S]*?content:\s*tab\.content/);
});
