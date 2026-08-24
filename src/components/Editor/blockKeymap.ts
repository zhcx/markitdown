import { baseKeymap, chainCommands, setBlockType } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { Schema } from 'prosemirror-model';
import { splitListItem } from 'prosemirror-schema-list';
import type { Command } from 'prosemirror-state';
import { blockSchema } from './blockSchema.ts';

export const insertHardBreak: Command = (state, dispatch) => {
  const hardBreak = state.schema.nodes.hard_break;
  if (!hardBreak) return false;
  if (dispatch) dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
  return true;
};

export const resetEmptyTextBlock: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.content.size > 0 || $from.parent.type === state.schema.nodes.paragraph) return false;
  return setBlockType(state.schema.nodes.paragraph)(state, dispatch);
};

export function createBlockKeyBindings(schema: Schema = blockSchema): Record<string, Command> {
  return {
    ...baseKeymap,
    Enter: chainCommands(
      splitListItem(schema.nodes.task_item),
      splitListItem(schema.nodes.list_item),
      baseKeymap.Enter,
    ),
    'Shift-Enter': insertHardBreak,
    Backspace: chainCommands(resetEmptyTextBlock, baseKeymap.Backspace),
  };
}

export function createBlockKeymap(schema: Schema = blockSchema) {
  return keymap(createBlockKeyBindings(schema));
}
