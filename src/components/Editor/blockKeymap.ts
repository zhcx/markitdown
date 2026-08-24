import { baseKeymap, chainCommands, newlineInCode, setBlockType } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { splitListItem } from 'prosemirror-schema-list';
import type { Command } from 'prosemirror-state';
import { blockSchema } from './blockSchema.ts';

export const insertHardBreak: Command = (state, dispatch) => {
  const hardBreak = state.schema.nodes.hard_break;
  if (!hardBreak) return false;
  const { $from } = state.selection;
  if (!$from.parent.contentMatchAt($from.index()).matchType(hardBreak)) return false;
  if (dispatch) dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
  return true;
};

export const resetEmptyTextBlock: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.content.size > 0 || $from.parent.type === state.schema.nodes.paragraph) return false;
  return setBlockType(state.schema.nodes.paragraph)(state, dispatch);
};

const splitTaskItem: Command = (state, dispatch) => splitListItem(
  blockSchema.nodes.task_item,
  { checked: false },
)(state, dispatch ? transaction => {
  const { $from } = transaction.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type !== blockSchema.nodes.task_item) continue;
    transaction.setNodeMarkup($from.before(depth), blockSchema.nodes.task_item, {
      ...$from.node(depth).attrs,
      checked: false,
    });
    break;
  }
  dispatch(transaction);
} : undefined);

export function createBlockKeyBindings(): Record<string, Command> {
  return {
    ...baseKeymap,
    Enter: chainCommands(
      splitTaskItem,
      splitListItem(blockSchema.nodes.list_item),
      baseKeymap.Enter,
    ),
    'Shift-Enter': chainCommands(newlineInCode, insertHardBreak),
    Backspace: chainCommands(resetEmptyTextBlock, baseKeymap.Backspace),
  };
}

export function createBlockKeymap() {
  return keymap(createBlockKeyBindings());
}
