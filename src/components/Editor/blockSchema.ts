import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
  type MarkdownSerializerState,
  type ParseSpec,
} from 'prosemirror-markdown';
import { Schema, type DOMOutputSpec, type Node } from 'prosemirror-model';
import MarkdownIt from 'markdown-it';

const codeBlockToDOM = (node: Node): DOMOutputSpec => {
  const codeAttrs = node.attrs.params ? { class: `language-${node.attrs.params.split(/\s+/u)[0]}` } : {};
  return ['pre', ['code', codeAttrs, 0]];
};

const taskItemToDOM = (node: Node): DOMOutputSpec => [
  'li',
  { class: node.attrs.checked ? 'task-item is-checked' : 'task-item' },
  ['span', { class: 'task-checkbox', contenteditable: 'false' }, [
    'input',
    { type: 'checkbox', checked: node.attrs.checked ? 'checked' : null, disabled: 'disabled' },
  ]],
  0,
];

const imageToDOM = (node: Node): DOMOutputSpec => {
  const attrs: Record<string, string> = { src: node.attrs.src };
  if (node.attrs.alt) attrs.alt = node.attrs.alt;
  if (node.attrs.title) attrs.title = node.attrs.title;
  return ['img', attrs];
};

const tableCellToDOM = (node: Node): DOMOutputSpec => {
  const attrs: Record<string, string> = {};
  if (node.attrs.align) attrs.style = `text-align: ${node.attrs.align}`;
  return [node.attrs.header ? 'th' : 'td', attrs, 0];
};

export const blockSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    blockquote: { content: 'block+', group: 'block', defining: true, toDOM: () => ['blockquote', 0] },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      toDOM: node => [`h${node.attrs.level}`, 0],
    },
    code_block: {
      attrs: { params: { default: '' } },
      content: 'text*',
      group: 'block',
      code: true,
      defining: true,
      marks: '',
      toDOM: codeBlockToDOM,
    },
    horizontal_rule: {
      attrs: { markup: { default: '---' } },
      group: 'block',
      atom: true,
      toDOM: node => ['hr', { 'data-markup': node.attrs.markup }],
    },
    bullet_list: {
      attrs: { tight: { default: false }, bullet: { default: '-' } },
      content: 'list_item+',
      group: 'block',
      toDOM: () => ['ul', 0],
    },
    ordered_list: {
      attrs: { order: { default: 1 }, tight: { default: false } },
      content: 'list_item+',
      group: 'block',
      toDOM: node => ['ol', node.attrs.order === 1 ? {} : { start: node.attrs.order }, 0],
    },
    list_item: { content: 'paragraph block*', defining: true, toDOM: () => ['li', 0] },
    task_list: {
      attrs: { tight: { default: false } },
      content: 'task_item+',
      group: 'block',
      toDOM: () => ['ul', { class: 'task-list' }, 0],
    },
    task_item: {
      attrs: { checked: { default: false } },
      content: 'paragraph block*',
      defining: true,
      toDOM: taskItemToDOM,
    },
    table: {
      content: 'table_row+',
      group: 'block',
      isolating: true,
      toDOM: () => ['table', ['tbody', 0]],
    },
    table_row: {
      content: 'table_cell+',
      toDOM: () => ['tr', 0],
    },
    table_cell: {
      attrs: { header: { default: false }, align: { default: null } },
      content: 'inline*',
      isolating: true,
      toDOM: tableCellToDOM,
    },
    image: {
      inline: true,
      attrs: { src: {}, alt: { default: null }, title: { default: null } },
      group: 'inline',
      draggable: true,
      toDOM: imageToDOM,
    },
    hard_break: { inline: true, group: 'inline', selectable: false, toDOM: () => ['br'] },
    text: { group: 'inline' },
  },
  marks: {
    em: { toDOM: () => ['em', 0] },
    strong: { toDOM: () => ['strong', 0] },
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      toDOM: mark => ['a', { href: mark.attrs.href, title: mark.attrs.title }, 0],
    },
    code: { code: true, toDOM: () => ['code', 0] },
    strike: { toDOM: () => ['s', 0] },
  },
});

const markdownTokenizer = new MarkdownIt({ html: false, breaks: false, linkify: false, typographer: false });

const cellAttrs = (header: boolean): NonNullable<ParseSpec['getAttrs']> => token => {
  const style = token.attrGet('style') || '';
  const align = /text-align:\s*(left|center|right)/iu.exec(style)?.[1] || null;
  return { header, align };
};

const tableTokens: Record<string, ParseSpec> = {
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: { block: 'table_cell', getAttrs: cellAttrs(true) },
  td: { block: 'table_cell', getAttrs: cellAttrs(false) },
};

export const blockMarkdownParser = new MarkdownParser(
  blockSchema,
  markdownTokenizer,
  { ...defaultMarkdownParser.tokens, ...tableTokens },
);

const renderTableRow = (state: MarkdownSerializerState, row: Node) => {
  state.write('|');
  row.forEach(cell => {
    state.write(' ');
    state.renderInline(cell, false);
    state.write(' |');
  });
  state.ensureNewLine();
};

const alignmentDelimiter = (align: string | null) => {
  if (align === 'left') return ':---';
  if (align === 'center') return ':---:';
  if (align === 'right') return '---:';
  return '---';
};

export const blockMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    task_list: (state, node) => state.renderList(
      node,
      '  ',
      index => `- [${node.child(index).attrs.checked ? 'x' : ' '}] `,
    ),
    task_item: (state, node) => state.renderContent(node),
    table: (state, node) => {
      const header = node.firstChild;
      if (!header) return;
      renderTableRow(state, header);
      state.write('|');
      header.forEach(cell => state.write(` ${alignmentDelimiter(cell.attrs.align)} |`));
      state.ensureNewLine();
      for (let index = 1; index < node.childCount; index += 1) renderTableRow(state, node.child(index));
      state.closeBlock(node);
    },
    table_row: renderTableRow,
    table_cell: (state, node) => state.renderInline(node, false),
  },
  defaultMarkdownSerializer.marks,
  { escapeExtraCharacters: /\|/g },
);
