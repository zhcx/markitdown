import { setBlockType } from 'prosemirror-commands';
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { Fragment, type Node } from 'prosemirror-model';
import { blockSchema } from './blockSchema.ts';
import type { BlockNodeType } from '../../types/blockEditor.ts';

export type BlockPropertyType = Exclude<BlockNodeType, 'image'>;

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

function blockContentAsParagraph(node: Node, schema = blockSchema) {
  if (node.type.name === 'paragraph' || node.type.name === 'heading') {
    return schema.nodes.paragraph.create(null, node.content);
  }
  return schema.nodes.paragraph.create(null, node.textContent ? schema.text(node.textContent) : undefined);
}

function createPropertyBlock(type: BlockPropertyType, current: Node, attrs: Record<string, unknown> = {}, schema = blockSchema): Node {
  const paragraph = blockContentAsParagraph(current, schema);
  switch (type) {
    case 'paragraph':
      return paragraph;
    case 'heading':
      return schema.nodes.heading.create({ level: Number(attrs.level) || 1 }, paragraph.content);
    case 'bullet_list':
      return schema.nodes.bullet_list.create({ tight: false, bullet: '-' }, schema.nodes.list_item.create(null, paragraph));
    case 'ordered_list':
      return schema.nodes.ordered_list.create({ order: 1, tight: false }, schema.nodes.list_item.create(null, paragraph));
    case 'task_list':
      return schema.nodes.task_list.create({ tight: false }, schema.nodes.task_item.create({ checked: false }, paragraph));
    case 'blockquote':
      return schema.nodes.blockquote.create(null, paragraph);
    case 'code_block':
      return schema.nodes.code_block.create({ params: String(attrs.params || '') }, current.textContent ? schema.text(current.textContent) : undefined);
    case 'horizontal_rule':
      return schema.nodes.horizontal_rule.create({ markup: '---' });
    default:
      return paragraph;
  }
}

function topLevelBlockRange(state: EditorState) {
  const index = state.selection.$from.index(0);
  let from = 0;
  for (let current = 0; current < index; current += 1) from += state.doc.child(current).nodeSize;
  const node = state.doc.child(index);
  return { index, from, to: from + node.nodeSize, node };
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

export function changeCurrentBlockType(type: BlockPropertyType, attrs: Record<string, unknown> = {}): Command {
  return (state, dispatch) => {
    const range = topLevelBlockRange(state);
    const replacement = createPropertyBlock(type, range.node, attrs, state.schema);
    if (!dispatch) return true;
    const transaction = state.tr.replaceWith(range.from, range.to, replacement);
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(Math.min(transaction.doc.content.size, range.from + 1))));
    dispatch(transaction);
    return true;
  };
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
