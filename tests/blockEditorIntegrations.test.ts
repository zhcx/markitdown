import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SLASH_COMMANDS, filterSlashCommands } from '../src/utils/slashCommands.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('basic slash commands expose block actions without changing filtering', () => {
  const byId = new Map(SLASH_COMMANDS.map(command => [command.id, command]));
  assert.deepEqual(byId.get('heading-1')?.blockAction, { kind: 'turn-into', type: 'heading', level: 1 });
  assert.deepEqual(byId.get('task-list')?.blockAction, { kind: 'insert', type: 'task_list' });
  assert.equal(byId.get('table')?.blockAction, undefined);
  assert.equal(filterSlashCommands('todo')[0]?.id, 'task-list');
});

test('editor integrations continue to depend on EditorController', () => {
  const toolbar = read('src/components/Toolbar/Toolbar.tsx');
  const aiStore = read('src/stores/aiStore.ts');
  assert.match(toolbar, /editorView\.state\.selection/);
  assert.match(toolbar, /editorView\.dispatch/);
  assert.match(aiStore, /editorView\.replaceRange|editorView\.dispatch/);
  assert.doesNotMatch(toolbar, /EditorView/);
  assert.doesNotMatch(aiStore, /EditorView/);
});

test('unsupported slash commands retain their source insertion for safe fallback', () => {
  const source = read('src/utils/slashCommands.ts');
  assert.match(source, /id: 'table'[\s\S]*insertion:/);
  assert.match(source, /id: 'math'[\s\S]*insertion:/);
  assert.match(source, /id: 'mermaid'[\s\S]*insertion:/);
});
