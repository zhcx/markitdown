import { setBlockType } from 'prosemirror-commands';
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { Fragment, type Node } from 'prosemirror-model';
import { blockSchema } from './blockSchema.ts';
import type { BlockNodeType } from '../../types/blockEditor.ts';

function createInsertedBlock(type: BlockNodeType, schema = blockSchema): Node {
  switch (type) {
    case 'heading': return schema.nodes.heading.create({ level: 1 });
    case 'bullet_list': return schema.nodes.bullet_list.create(null, schema.nodes.list_item.create(null, schema.nodes.paragraph.create()));
    case 'ordered_list': return schema.nodes.ordered_list.create({ order: 1 }, schema.nodes.list_item.create(null, schema.nodes.paragraph.create()));
    case 'task_list': return schema.nodes.task_list.create(null, schema.nodes.task_item.create({ checked: false }, schema.nodes.paragraph.create()));
    case 'blockquote': return schema.nodes.blockquote.create(null, schema.nodes.paragraph.create());
    case 'code_block': return schema.nodes.code_block.create({ params: '' });
    case 'horizontal_rule': return schema.nodes.horizontal_rule.create();
    case 'image': return schema.nodes.paragraph.create();
    case 'paragraph': return schema.nodes.paragraph.create();
    default: return schema.nodes.paragraph.create();
  }
}

function currentTopLevelRange(state: EditorState) {
  const { $from } = state.selection;
  const depth = Math.max(1, $from.depth);
  return {
    index: $from.index(0),
    from: $from.before(depth),
    to: $from.after(depth),
  };
}

export function turnInto(type: 'heading', level: 1 | 2 | 3 | 4): Command {
  return setBlockType(blockSchema.nodes[type], { level });
}

export function insertBlock(type: BlockNodeType): Command {
  return (state, dispatch) => {
    const range = currentTopLevelRange(state);
    const inserted = createInsertedBlock(type, state.schema);
    const paragraph = state.schema.nodes.paragraph.create();
    if (dispatch) {
      const transaction = state.tr.insert(range.to, Fragment.fromArray([inserted, paragraph]));
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(range.to + inserted.nodeSize + 1)));
      dispatch(transaction);
    }
    return true;
  };
}

export const deleteCurrentBlock: Command = (state, dispatch) => {
  const range = currentTopLevelRange(state);
  if (!dispatch) return true;
  if (state.doc.childCount === 1) {
    dispatch(state.tr.replaceWith(range.from, range.to, state.schema.nodes.paragraph.create()));
  } else {
    dispatch(state.tr.delete(range.from, range.to));
  }
  return true;
};

export function duplicateTopLevelBlock(): Command {
  return (state, dispatch) => {
    const range = currentTopLevelRange(state);
    if (!dispatch) return true;
    const node = state.doc.nodeAt(range.from);
    if (!node) return false;
    dispatch(state.tr.insert(range.to, node.copy(node.content)));
    return true;
  };
}

export function moveTopLevelBlock(fromIndex: number, toIndex: number): Command {
  return (state, dispatch) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= state.doc.childCount || toIndex >= state.doc.childCount) return false;
    if (fromIndex === toIndex) return true;
    if (!dispatch) return true;
    const nodes = state.doc.content.content.slice();
    const [moved] = nodes.splice(fromIndex, 1);
    nodes.splice(toIndex, 0, moved);
    const transaction: Transaction = state.tr.replaceWith(0, state.doc.content.size, Fragment.fromArray(nodes));
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(1)));
    dispatch(transaction);
    return true;
  };
}

export function createBlockCommandMap() {
  return {
    turnInto,
    insertBlock,
    deleteCurrentBlock,
    duplicateTopLevelBlock,
    moveTopLevelBlock,
  };
}
