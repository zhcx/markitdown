import test from 'node:test';
import assert from 'node:assert/strict';
import { applySavedTab, type PersistedTab } from '../src/utils/tabPersistence.ts';

const tabs: PersistedTab[] = [
  { id: 'first', title: 'first.md', path: 'C:\\docs\\first.md', content: 'first', modified: true },
  { id: 'second', title: '未命名', path: null, content: 'second', modified: true },
];

test('marks only the saved tab clean and applies its save path', () => {
  const result = applySavedTab(tabs, 'second', 'C:\\docs\\second.md', 'second');

  assert.deepEqual(result, [
    tabs[0],
    { ...tabs[1], title: 'second.md', path: 'C:\\docs\\second.md', modified: false },
  ]);
});

test('keeps a tab dirty when its content changes while saving', () => {
  const changedTabs = tabs.map(tab => tab.id === 'second' ? { ...tab, content: 'newer content' } : tab);
  const result = applySavedTab(changedTabs, 'second', 'C:\\docs\\second.md', 'second');

  assert.equal(result[1].modified, true);
  assert.equal(result[1].path, 'C:\\docs\\second.md');
});

test('preserves an optional editor mode while applying a saved path', () => {
  const blockTab: PersistedTab = { ...tabs[0], editorMode: 'blocks' };
  const result = applySavedTab([blockTab], blockTab.id, 'C:\\docs\\first.md', blockTab.content);
  assert.equal(result[0].editorMode, 'blocks');
});
