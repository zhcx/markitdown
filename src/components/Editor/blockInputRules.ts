import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import type { Schema } from 'prosemirror-model';
import { blockSchema } from './blockSchema.ts';

export type BlockInputRuleMatch =
  | { kind: 'heading'; level: number }
  | { kind: 'bullet_list' }
  | { kind: 'ordered_list'; order: number }
  | { kind: 'task_list'; checked: boolean }
  | { kind: 'blockquote' }
  | { kind: 'code_block'; params: string };

export function findBlockInputRule(text: string): BlockInputRuleMatch | null {
  const heading = /^(#{1,4})\s$/.exec(text);
  if (heading) return { kind: 'heading', level: heading[1].length };
  if (/^[-*]\s$/.test(text)) return { kind: 'bullet_list' };
  const ordered = /^(\d+)\.\s$/.exec(text);
  if (ordered) return { kind: 'ordered_list', order: Number(ordered[1]) };
  const task = /^-\s\[([ xX])\]\s$/.exec(text);
  if (task) return { kind: 'task_list', checked: task[1].toLowerCase() === 'x' };
  if (/^>\s$/.test(text)) return { kind: 'blockquote' };
  const code = /^```([\w-]*)\s$/.exec(text);
  if (code) return { kind: 'code_block', params: code[1] };
  return null;
}

function taskInputRule(schema: Schema) {
  return new InputRule(/^-\s\[([ xX])\]\s$/, (state, match, start, end) => {
    const checked = match[1].toLowerCase() === 'x';
    const paragraph = schema.nodes.paragraph.create(null, state.schema.text(''));
    const item = schema.nodes.task_item.create({ checked }, paragraph);
    const list = schema.nodes.task_list.create(null, item);
    return state.tr.replaceWith(start, end, list);
  });
}

export function createBlockInputRules(schema: Schema = blockSchema) {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,4})\s$/, schema.nodes.heading, match => ({ level: match[1].length })),
      textblockTypeInputRule(/^```([\w-]*)\s$/, schema.nodes.code_block, match => ({ params: match[1] || '' })),
      wrappingInputRule(/^[-*]\s$/, schema.nodes.bullet_list),
      wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, match => ({ order: Number(match[1]) })),
      wrappingInputRule(/^>\s$/, schema.nodes.blockquote),
      taskInputRule(schema),
    ],
  });
}
