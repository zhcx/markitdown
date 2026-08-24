export type EditorMode = 'blocks' | 'source';

export type BlockNodeType =
  | 'paragraph'
  | 'heading'
  | 'bullet_list'
  | 'ordered_list'
  | 'task_list'
  | 'blockquote'
  | 'code_block'
  | 'horizontal_rule'
  | 'image';

export type UnsupportedMarkdownKind =
  | 'table'
  | 'math'
  | 'mermaid'
  | 'html'
  | 'details'
  | 'footnote'
  | 'video'
  | 'toc'
  | 'unknown';

export interface MarkdownCapability {
  supported: boolean;
  unsupported: UnsupportedMarkdownKind[];
  message: string;
}

export interface BlockSourceRange {
  blockId: string;
  type: BlockNodeType;
  sourceFrom: number;
  sourceTo: number;
  lineFrom: number;
  lineTo: number;
}

export interface BlockSourceMap {
  source: string;
  blocks: BlockSourceRange[];
  sourceOffsetForBlock: (blockId: string, innerOffset?: number) => number;
  blockForSourceOffset: (offset: number) => BlockSourceRange | undefined;
}

export const BLOCK_NODE_TYPES: BlockNodeType[] = [
  'paragraph',
  'heading',
  'bullet_list',
  'ordered_list',
  'task_list',
  'blockquote',
  'code_block',
  'horizontal_rule',
  'image',
];

export const DEFAULT_BLOCK_EDITOR_MODE: EditorMode = 'blocks';
