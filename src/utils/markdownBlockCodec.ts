import type { Node } from 'prosemirror-model';
import type { BlockNodeType, MarkdownCapability, BlockSourceMap } from '../types/blockEditor.ts';
import { blockMarkdownParser, blockMarkdownSerializer, blockSchema } from '../components/Editor/blockSchema.ts';
import { inspectMarkdownCapability } from './markdownBlockCapability.ts';
import { buildBlockSourceMap } from './blockSourceMap.ts';
import { segmentMarkdown } from './markdownBlockSegments.ts';

function withNodeContent(node: Node, content: readonly Node[]): Node {
  if (node.isText || node.isLeaf) return node;
  return node.type.create(node.attrs, content, node.marks);
}

function taskItemFromListItem(node: Node): Node | null {
  const paragraph = node.firstChild;
  if (!paragraph || paragraph.type.name !== 'paragraph') return null;
  const match = /^\[([ xX])\]\s/.exec(paragraph.textContent);
  if (!match) return null;

  const strippedParagraph = paragraph.type.create(
    paragraph.attrs,
    paragraph.content.cut(4),
    paragraph.marks,
  );
  const children: Node[] = [strippedParagraph];
  for (let index = 1; index < node.childCount; index += 1) children.push(node.child(index));
  return blockSchema.nodes.task_item.create(
    { checked: match[1].toLowerCase() === 'x' },
    children,
  );
}

function normalizeTaskLists(node: Node): Node {
  if (node.isText || node.isLeaf) return node;
  const children: Node[] = [];
  node.forEach(child => children.push(normalizeTaskLists(child)));
  if (node.type.name === 'bullet_list') {
    const taskItems = children.map(taskItemFromListItem);
    if (taskItems.every((item): item is Node => item !== null)) {
      return blockSchema.nodes.task_list.create(node.attrs, taskItems);
    }
  }
  return withNodeContent(node, children);
}

function blockType(node: Node): BlockNodeType | null {
  switch (node.type.name) {
    case 'paragraph':
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
      return node.type.name;
    default:
      return null;
  }
}

function emptySourceMap(source: string): BlockSourceMap {
  return {
    source,
    blocks: [],
    sourceOffsetForBlock: () => 0,
    blockForSourceOffset: () => undefined,
  };
}

export interface ParsedMarkdown {
  mode: 'blocks' | 'source';
  source: string;
  capability: MarkdownCapability;
  document: Node | null;
  blockTypes: BlockNodeType[];
  sourceMap: BlockSourceMap | null;
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const capability = inspectMarkdownCapability(source);
  if (!capability.supported) {
    return {
      mode: 'source',
      source,
      capability,
      document: null,
      blockTypes: [],
      sourceMap: emptySourceMap(source),
    };
  }

  const nodes: Node[] = [];
  for (const segment of segmentMarkdown(source)) {
    if (segment.kind === 'raw') {
      const content = segment.source ? blockSchema.text(segment.source) : undefined;
      nodes.push(blockSchema.nodes.raw_markdown.create({ kind: segment.rawKind }, content));
      continue;
    }
    try {
      const parsed = normalizeTaskLists(blockMarkdownParser.parse(segment.source));
      parsed.forEach(node => nodes.push(node));
    } catch {
      const content = segment.source ? blockSchema.text(segment.source) : undefined;
      nodes.push(blockSchema.nodes.raw_markdown.create({ kind: 'unknown' }, content));
    }
  }
  const document = blockSchema.topNodeType.create(
    null,
    nodes.length ? nodes : [blockSchema.nodes.paragraph.create()],
  );
  const blockTypes = document.content.content
    .map(blockType)
    .filter((type): type is BlockNodeType => type !== null);
  return {
    mode: 'blocks',
    source,
    capability,
    document,
    blockTypes,
    sourceMap: buildBlockSourceMap(source, document),
  };
}

export function serializeMarkdown(document: Node): string {
  const output = blockMarkdownSerializer.serialize(document);
  return output.endsWith('\n') ? output : `${output}\n`;
}
