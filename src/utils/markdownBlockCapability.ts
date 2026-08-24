import MarkdownIt from 'markdown-it';
import type { MarkdownCapability, UnsupportedMarkdownKind } from '../types/blockEditor.ts';

const markdown = new MarkdownIt({ html: true, linkify: false, typographer: false });

const addUnique = (items: UnsupportedMarkdownKind[], kind: UnsupportedMarkdownKind) => {
  if (!items.includes(kind)) items.push(kind);
};

export function inspectMarkdownCapability(source: string): MarkdownCapability {
  const unsupported: UnsupportedMarkdownKind[] = [];
  const tokens = markdown.parse(source, {});

  for (const token of tokens) {
    if (token.type === 'table_open') addUnique(unsupported, 'table');
    if (token.type === 'html_block' || token.type === 'html_inline') addUnique(unsupported, 'html');
    if (token.type === 'fence' && /^\s*mermaid(?:\s|$)/iu.test(token.info || '')) addUnique(unsupported, 'mermaid');
  }

  if (/(?:^|\n)\s*<\s*(?:details|summary)\b/iu.test(source)) {
    addUnique(unsupported, 'details');
  }
  if (/(?:^|\n)\s*\[TOC\]\s*(?:\n|$)/iu.test(source)) addUnique(unsupported, 'toc');
  if (/@\[(?:video|youtube|bilibili)\]\(/iu.test(source)) addUnique(unsupported, 'video');
  if (/(?:^|\n)\s*\[\^[^\]]+\]:/u.test(source) || /\[\^[^\]]+\]/u.test(source)) addUnique(unsupported, 'footnote');
  if (/(?:^|\n)\s*\$\$[\s\S]*?\$\$/u.test(source) || /(?<!\\)\$[^$\n]+\$/u.test(source)) addUnique(unsupported, 'math');

  return {
    supported: unsupported.length === 0,
    unsupported,
    message: unsupported.length === 0
      ? ''
      : `该文档包含暂不支持的 Markdown 结构：${unsupported.join('、')}`,
  };
}
