import type { Node } from 'prosemirror-model';
import { blockMarkdownSerializer, blockSchema } from '../components/Editor/blockSchema.ts';
import type { BlockNodeType, BlockSourceMap, BlockSourceRange } from '../types/blockEditor.ts';

function serializeSingleBlock(node: Node) {
  const doc = blockSchema.topNodeType.create(null, node);
  return blockMarkdownSerializer.serialize(doc).replace(/\n+$/u, '');
}

function lineNumberAt(source: string, offset: number) {
  return source.slice(0, Math.max(0, offset)).split('\n').length;
}

function nodeType(node: Node): BlockNodeType {
  switch (node.type.name) {
    case 'heading':
    case 'bullet_list':
    case 'ordered_list':
    case 'task_list':
    case 'blockquote':
    case 'code_block':
    case 'horizontal_rule':
    case 'table':
    case 'raw_markdown':
    case 'image':
    case 'paragraph':
      return node.type.name;
    default:
      return 'paragraph';
  }
}

export function buildBlockSourceMap(source: string, document: Node): BlockSourceMap {
  const blocks: BlockSourceRange[] = [];
  let cursor = 0;

  document.forEach((node, _offset, index) => {
    const blockText = serializeSingleBlock(node);
    const match = source.indexOf(blockText, cursor);
    const sourceFrom = match >= 0 ? match : cursor;
    const sourceTo = Math.min(source.length, sourceFrom + blockText.length);
    blocks.push({
      blockId: `block-${index + 1}`,
      type: nodeType(node),
      sourceFrom,
      sourceTo,
      lineFrom: lineNumberAt(source, sourceFrom),
      lineTo: lineNumberAt(source, sourceTo),
    });
    cursor = sourceTo;
  });

  return {
    source,
    blocks,
    sourceOffsetForBlock: (blockId, innerOffset = 0) => {
      const block = blocks.find(item => item.blockId === blockId);
      if (!block) return 0;
      return Math.max(block.sourceFrom, Math.min(block.sourceTo, block.sourceFrom + Math.max(0, innerOffset)));
    },
    blockForSourceOffset: (offset) => {
      const safeOffset = Math.max(0, Math.min(source.length, offset));
      const exact = blocks.find(block => safeOffset >= block.sourceFrom && safeOffset <= block.sourceTo);
      if (exact) return exact;
      return blocks.reduce<BlockSourceRange | undefined>((closest, block) => {
        if (!closest) return block;
        const distance = Math.abs(block.sourceFrom - safeOffset);
        const closestDistance = Math.abs(closest.sourceFrom - safeOffset);
        return distance <= closestDistance ? block : closest;
      }, undefined);
    },
  };
}
