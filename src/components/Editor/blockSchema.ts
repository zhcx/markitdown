import { defaultMarkdownParser, defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';
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

export const blockMarkdownParser = new MarkdownParser(
  blockSchema,
  markdownTokenizer,
  defaultMarkdownParser.tokens,
);

export const blockMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    task_list: (state, node) => state.renderList(
      node,
      '  ',
      index => `- [${node.child(index).attrs.checked ? 'x' : ' '}] `,
    ),
    task_item: (state, node) => state.renderContent(node),
  },
  defaultMarkdownSerializer.marks,
);
