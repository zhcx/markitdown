import { defaultMarkdownParser, defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';
import { Schema } from 'prosemirror-model';
import MarkdownIt from 'markdown-it';

export const blockSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    blockquote: { content: 'block+', group: 'block', defining: true },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
    },
    code_block: {
      attrs: { params: { default: '' } },
      content: 'text*',
      group: 'block',
      code: true,
      defining: true,
      marks: '',
    },
    horizontal_rule: {
      attrs: { markup: { default: '---' } },
      group: 'block',
      atom: true,
    },
    bullet_list: {
      attrs: { tight: { default: false }, bullet: { default: '-' } },
      content: 'list_item+',
      group: 'block',
    },
    ordered_list: {
      attrs: { order: { default: 1 }, tight: { default: false } },
      content: 'list_item+',
      group: 'block',
    },
    list_item: { content: 'paragraph block*', defining: true },
    task_list: {
      attrs: { tight: { default: false } },
      content: 'task_item+',
      group: 'block',
    },
    task_item: {
      attrs: { checked: { default: false } },
      content: 'paragraph block*',
      defining: true,
    },
    image: {
      inline: true,
      attrs: { src: {}, alt: { default: null }, title: { default: null } },
      group: 'inline',
      draggable: true,
    },
    hard_break: { inline: true, group: 'inline', selectable: false },
    text: { group: 'inline' },
  },
  marks: {
    em: {},
    strong: {},
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
    },
    code: { code: true },
    strike: {},
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
