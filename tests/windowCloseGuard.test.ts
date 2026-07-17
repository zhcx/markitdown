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
    askToSave: async () => { prompted = true; return true; },
    confirmDiscard: async () => false,
    chooseSavePath: async () => null,
    saveTab: async () => undefined,
  });

  assert.equal(result, 'close');
  assert.equal(prompted, false);
});

test('saves every modified tab before closing', async () => {
  const saved: Array<[string, string]> = [];
  const result = await guardWindowClose(tabs, {
    askToSave: async modifiedTabs => {
      assert.deepEqual(modifiedTabs.map(tab => tab.id), ['existing', 'untitled']);
      return true;
    },
    confirmDiscard: async () => false,
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
    askToSave: async () => true,
    confirmDiscard: async () => false,
    chooseSavePath: async () => null,
    saveTab: async (tabId, path) => { saved.push([tabId, path]); },
  });

  assert.equal(result, 'stay');
  assert.deepEqual(saved, [['existing', 'C:\\docs\\existing.md']]);
});

test('only closes without saving after discard is confirmed', async () => {
  let discardConfirmed = false;
  const dependencies = {
    askToSave: async () => false,
    confirmDiscard: async () => discardConfirmed,
    chooseSavePath: async () => null,
    saveTab: async () => undefined,
  };

  assert.equal(await guardWindowClose(tabs, dependencies), 'stay');
  discardConfirmed = true;
  assert.equal(await guardWindowClose(tabs, dependencies), 'close');
});
