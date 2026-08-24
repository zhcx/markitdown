import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('S3 backup remains a post-save side effect and keeps the existing command', () => {
  const store = read('src/stores/appStore.ts');
  const saveTab = store.match(/saveTab:\s*async[\s\S]*?\n\s*},\r?\n\r?\n\s*saveFile:/)?.[0] || '';
  assert.ok(saveTab.indexOf('save_file_content') < saveTab.indexOf('s3_enqueue_backup'));
  assert.match(saveTab, /s3_enqueue_backup/);
});

test('S3 status store continues filtering only S3 provider events', () => {
  const store = read('src/stores/s3Store.ts');
  assert.match(store, /payload\.provider !== 's3'/);
  assert.match(store, /s3_retry_pending/);
});
