import test from 'node:test';
import assert from 'node:assert/strict';
import { guardWindowClose, type CloseGuardTab } from '../src/utils/windowCloseGuard.ts';

const tabs: CloseGuardTab[] = [
  { id: 'saved', title: 'saved.md', path: 'C:\\docs\\saved.md', modified: false },
  { id: 'existing', title: 'existing.md', path: 'C:\\docs\\existing.md', modified: true },
  { id: 'untitled', title: '未命名', path: null, modified: true },
];

test('closes immediately when every tab is saved', async () => {
  let prompted = false;
  const result = await guardWindowClose(tabs.map(tab => ({ ...tab, modified: false })), {
    promptAction: async () => { prompted = true; return 'save'; },
    chooseSavePath: async () => null,
    saveTab: async () => undefined,
  });

  assert.equal(result, 'close');
  assert.equal(prompted, false);
});

test('saves every modified tab before closing', async () => {
  const saved: Array<[string, string]> = [];
  const result = await guardWindowClose(tabs, {
    promptAction: async modifiedTabs => {
      assert.deepEqual(modifiedTabs.map(tab => tab.id), ['existing', 'untitled']);
      return 'save';
    },
    chooseSavePath: async tab => `C:\\docs\\${tab.id}.md`,
    saveTab: async (tabId, path) => { saved.push([tabId, path]); },
  });

  assert.equal(result, 'close');
  assert.deepEqual(saved, [
    ['existing', 'C:\\docs\\existing.md'],
    ['untitled', 'C:\\docs\\untitled.md'],
  ]);
});

test('keeps the window open when save-as is cancelled', async () => {
  const saved: Array<[string, string]> = [];
  const result = await guardWindowClose(tabs, {
    promptAction: async () => 'save',
    chooseSavePath: async () => null,
    saveTab: async (tabId, path) => { saved.push([tabId, path]); },
  });

  assert.equal(result, 'stay');
  assert.deepEqual(saved, [['existing', 'C:\\docs\\existing.md']]);
});

test('closes without saving when discard is selected', async () => {
  const result = await guardWindowClose(tabs, {
    promptAction: async () => 'discard',
    chooseSavePath: async () => null,
    saveTab: async () => undefined,
  });

  assert.equal(result, 'close');
});

test('keeps the window open when the close prompt is dismissed', async () => {
  const result = await guardWindowClose(tabs, {
    promptAction: async () => 'cancel',
    chooseSavePath: async () => null,
    saveTab: async () => undefined,
  });

  assert.equal(result, 'stay');
});
