import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterSlashCommands,
  findSlashCommandTrigger,
  SLASH_COMMANDS,
} from '../src/utils/slashCommands.ts';

test('opens slash commands for the first token on a line', () => {
  assert.deepEqual(findSlashCommandTrigger('/h2', 20, 23), {
    from: 20,
    to: 23,
    query: 'h2',
  });

  assert.deepEqual(findSlashCommandTrigger('  /表格', 8, 13), {
    from: 10,
    to: 13,
    query: '表格',
  });
});

test('does not open slash commands in prose, URLs, or after whitespace', () => {
  assert.equal(findSlashCommandTrigger('正文 /h1', 0, 6), null);
  assert.equal(findSlashCommandTrigger('https://example.com', 0, 8), null);
  assert.equal(findSlashCommandTrigger('/heading one', 0, 12), null);
});

test('filters commands by shortcut, Chinese title, and English aliases', () => {
  assert.deepEqual(filterSlashCommands('h2').map((command) => command.id), ['heading-2']);
  assert.deepEqual(filterSlashCommands('表格').map((command) => command.id), ['table']);
  assert.ok(filterSlashCommands('formula').some((command) => command.id === 'math'));
});

test('every slash command has a valid post-insertion selection', () => {
  for (const command of SLASH_COMMANDS) {
    const { text, selectionStart = text.length, selectionEnd = selectionStart } = command.insertion;
    assert.ok(selectionStart >= 0 && selectionStart <= text.length, command.id);
    assert.ok(selectionEnd >= selectionStart && selectionEnd <= text.length, command.id);
  }
});
