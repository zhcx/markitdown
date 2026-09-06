import test from 'node:test';
import assert from 'node:assert/strict';
import { guardWindowClose } from '../src/utils/windowCloseGuard.ts';
import { createSaveQueue, DocumentSessions, sameDocument } from '../src/utils/documentSafety.ts';

test('concurrent saves stay ordered and a failed write does not poison the queue', async () => {
  const enqueue = createSaveQueue();
  const order: string[] = [];
  let release!: () => void;
  const first = enqueue(async () => { await new Promise<void>(resolve => {release=resolve;}); order.push('old'); throw Error('disk failure'); });
  const rejected = assert.rejects(first, /disk failure/);
  const second = enqueue(async () => {order.push('new');});
  await Promise.resolve();
  assert.deepEqual(order,[]);
  release();
  await rejected; await second;
  assert.deepEqual(order,['old','new']);
});

test('same text in a different tab cannot accept asynchronous edits', () => {
  assert.equal(sameDocument({activeTabId:'a',content:'text'}, {activeTabId:'b',content:'text'}), false);
  assert.equal(sameDocument({activeTabId:'a',content:'text'}, {activeTabId:'a',content:'new'}), false);
  assert.equal(sameDocument({activeTabId:'a',content:'text'}, {activeTabId:'a',content:'text'}), true);
});

test('document sessions retain independent undo state and dispose closed documents', () => {
  const sessions = new DocumentSessions<{undo:string[];dispose():void}>();
  let disposed = 0;
  const a = sessions.get('a', () => ({undo:['A'],dispose(){disposed++;}}));
  const b = sessions.get('b', () => ({undo:['B'],dispose(){disposed++;}}));
  a.undo.push('edited A');
  assert.notEqual(a,b);
  assert.deepEqual(b.undo,['B']);
  assert.equal(sessions.get('a', () => {throw new Error('must reuse');}),a);
  sessions.retain(['b']);
  assert.equal(disposed,1);
  assert.equal(sessions.get('b', () => {throw new Error('must reuse');}),b);
});

test('close refuses edits made while saving', async () => {
  const tabs = [{id:'a',title:'A',path:'a.md',modified:true}];
  const result = await guardWindowClose(tabs, {
    promptAction: async () => 'save', chooseSavePath: async () => null,
    saveTab: async () => {}, getTabs: () => tabs,
  });
  assert.equal(result, 'stay');
});

test('close cancellation during save prevents exit', async () => {
  let cancelled = false;
  const result = await guardWindowClose([{id:'a',title:'A',path:'a.md',modified:true}], {
    promptAction: async () => 'save', chooseSavePath: async () => null,
    saveTab: async () => {cancelled=true;}, isCancelled: () => cancelled,
  });
  assert.equal(result, 'stay');
});

test('new dirty tabs added while saving prevent exit', async () => {
  const result = await guardWindowClose([{id:'a',title:'A',path:'a.md',modified:true}], {
    promptAction: async () => 'save', chooseSavePath: async () => null,
    saveTab: async () => {}, getTabs: () => [{id:'b',title:'B',path:null,modified:true}],
  });
  assert.equal(result, 'stay');
});
