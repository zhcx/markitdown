import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('new and replacement tabs default to block editing', () => {
  const store = read('src/stores/appStore.ts');
  assert.match(store, /const initialTab: Tab = \{[\s\S]*editorMode: 'blocks'/);
  assert.match(store, /const newTab: Tab = \{[\s\S]*editorMode: 'blocks'/);
  assert.match(store, /setTabEditorMode:/);
});

test('local save remains ahead of both asynchronous cloud backup queues', () => {
  const store = read('src/stores/appStore.ts');
  const saveTab = store.match(/saveTab:\s*async[\s\S]*?\n\s*},\r?\n\r?\n\s*saveFile:/)?.[0] || '';
  assert.match(saveTab, /await invoke\('save_file_content'/);
  assert.match(saveTab, /void invoke\('webdav_enqueue_backup'/);
  assert.match(saveTab, /void invoke\('s3_enqueue_backup'/);
  assert.ok(saveTab.indexOf('save_file_content') < saveTab.indexOf('webdav_enqueue_backup'));
  assert.ok(saveTab.indexOf('save_file_content') < saveTab.indexOf('s3_enqueue_backup'));
});

test('block editor publishes through setContent instead of invoking Tauri directly', () => {
  const editor = read('src/components/Editor/BlockEditor.tsx');
  assert.match(editor, /onMarkdownChange/);
  assert.doesNotMatch(editor, /invoke\(/);
});
