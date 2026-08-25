import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITOR_COMMANDS,
  filterEditorCommands,
  getEditorCommandAvailability,
  groupEditorCommands,
} from '../src/utils/editorCommandRegistry.ts';

test('exposes block, format, media, and AI categories', () => {
  assert.deepEqual([...new Set(EDITOR_COMMANDS.map(command => command.category))], ['blocks', 'format', 'media', 'ai']);
});

test('searches Chinese labels, English aliases, and AI keywords', () => {
  assert.deepEqual(filterEditorCommands('翻译').map(command => command.id), ['ai-translate']);
  assert.ok(filterEditorCommands('rewrite').some(command => command.id === 'ai-rewrite'));
  assert.ok(filterEditorCommands('heading').some(command => command.id === 'heading-1'));
});

test('groups commands in the agreed menu order', () => {
  assert.deepEqual(groupEditorCommands(EDITOR_COMMANDS).map(group => group.category), ['blocks', 'format', 'media', 'ai']);
});

test('keeps unavailable AI commands visible with a configuration reason', () => {
  const command = EDITOR_COMMANDS.find(item => item.id === 'ai-rewrite');
  if (!command) throw new Error('missing AI rewrite command');
  assert.deepEqual(getEditorCommandAvailability(command, { mode: 'blocks', aiEnabled: false, aiConfigured: false }), {
    visible: true,
    enabled: false,
    reason: '请先在设置中启用并配置 AI',
  });
});
