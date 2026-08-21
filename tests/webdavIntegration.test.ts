import assert from 'node:assert/strict';
import test from 'node:test';
import { reduceWebDavStatus } from '../src/utils/webdavState.ts';

test('maps queued syncing success and error events to status-bar state', () => {
  const queued = reduceWebDavStatus(undefined, {
    document_id: 'a',
    local_path: 'note.md',
    phase: 'queued',
    timestamp: '2026-08-19T14:00:00Z',
  });
  assert.equal(queued.phase, 'queued');

  const syncing = reduceWebDavStatus(queued, {
    document_id: 'a',
    local_path: 'note.md',
    phase: 'syncing',
    timestamp: '2026-08-19T14:00:01Z',
  });
  assert.equal(syncing.phase, 'syncing');

  const success = reduceWebDavStatus(syncing, {
    document_id: 'a',
    local_path: 'note.md',
    phase: 'success',
    timestamp: '2026-08-19T14:00:02Z',
  });
  assert.equal(success.phase, 'success');
  assert.equal(success.last_success_at, '2026-08-19T14:00:02Z');
});

test('ignores a stale event from a different document when selecting current status', () => {
  const current = { document_id: 'current', phase: 'idle', error: '', last_success_at: '' };
  const next = reduceWebDavStatus(current, {
    document_id: 'other',
    local_path: 'other.md',
    phase: 'error',
    timestamp: '2026-08-19T14:00:00Z',
    error: 'offline',
  });
  assert.equal(next.document_id, 'current');
});

test('error event caps sanitized message at 240 characters', () => {
  const current = { document_id: 'a', phase: 'idle', error: '', last_success_at: '' };
  const next = reduceWebDavStatus(current, {
    document_id: 'a',
    local_path: 'note.md',
    phase: 'error',
    timestamp: '2026-08-19T14:00:00Z',
    error: 'x'.repeat(400),
  });
  assert.ok(next.error.length <= 240);
});

test('webdav store contract exposes status labels and retry', () => {
  const store = readFileSync(new URL('../src/stores/webdavStore.ts', import.meta.url), 'utf8');
  assert.match(store, /webdav_retry_pending/);
  assert.match(store, /listen<WebDavSyncEvent>\('webdav-sync-status'/);
});

test('successful local save enqueues WebDAV without awaiting cloud completion', () => {
  const source = readFileSync(new URL('../src/stores/appStore.ts', import.meta.url), 'utf8');
  const saveTab = source.match(/saveTab:\s*async[\s\S]*?\r?\n\s*},\r?\n\r?\n\s*saveFile:/)?.[0] || '';
  assert.match(saveTab, /await invoke\('save_file_content'/);
  assert.match(saveTab, /void invoke\('webdav_enqueue_backup'/);
  assert.ok(saveTab.indexOf('save_file_content') < saveTab.indexOf('webdav_enqueue_backup'));
});

test('startup initializes WebDAV after settings load', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(
    app,
    /useWebDavStore\.getState\(\)\.initialize\(useAppStore\.getState\(\)\.settings\.webdav\)/,
  );
});

import { readFileSync } from 'node:fs';
