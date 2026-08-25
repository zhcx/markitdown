import MarkdownIt from 'markdown-it';
import type { MarkdownBlockSegment, RawMarkdownKind } from '../types/blockEditor.ts';

const markdown = new MarkdownIt({ html: true, linkify: false, typographer: false });

function rawKindFor(type: string, source: string, info = ''): RawMarkdownKind | null {
  if (type === 'fence' && /^\s*mermaid(?:\s|$)/iu.test(info)) return 'mermaid';
  if (/^\s*<\s*(?:details|summary)\b/iu.test(source)) return 'details';
  if (type === 'html_block' || /<\/?[A-Za-z][^>]*>/u.test(source)) return 'html';
  if (/^\s*\$\$[\s\S]*?\$\$\s*$/u.test(source) || /(?<!\\)\$[^$\n]+\$/u.test(source)) return 'math';
  if (/^\s*\[\^[^\]]+\]:/u.test(source) || /\[\^[^\]]+\]/u.test(source)) return 'footnote';
  if (/^\s*@\[(?:video|youtube|bilibili)\]\(/iu.test(source)) return 'video';
  if (/^\s*\[TOC\]\s*$/iu.test(source)) return 'toc';
  if (/^\s*@\[[^\]]+\]\(/u.test(source)) return 'unknown';
  return null;
}

export function segmentMarkdown(source: string): MarkdownBlockSegment[] {
  if (!source) return [{ kind: 'structured', source: '', from: 0, to: 0 }];

  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') lineStarts.push(index + 1);
  }
  const offsetForLine = (line: number) => line < lineStarts.length ? lineStarts[line] : source.length;
  const ranges = markdown.parse(source, {})
    .filter(token => token.level === 0 && token.map && token.nesting !== -1)
    .map(token => ({ token, from: offsetForLine(token.map![0]), to: offsetForLine(token.map![1]) }))
    .sort((left, right) => left.from - right.from || right.to - left.to);

  const result: MarkdownBlockSegment[] = [];
  const append = (rawSource: string, from: number, to: number, type: string, info = '') => {
    const leading = /^(?:\r?\n)+/u.exec(rawSource)?.[0].length || 0;
    const trailing = /(?:\r?\n)+$/u.exec(rawSource)?.[0].length || 0;
    const end = trailing ? rawSource.length - trailing : rawSource.length;
    const blockSource = rawSource.slice(leading, end);
    if (!blockSource.trim()) return;
    const rawKind = rawKindFor(type, blockSource, info);
    if (rawKind) {
      result.push({ kind: 'raw', rawKind, source: blockSource, from: from + leading, to: to - trailing });
      return;
    }
    const previous = result[result.length - 1];
    if (type !== 'uncovered' && previous?.kind === 'structured') {
      previous.source += `\n\n${blockSource}`;
      previous.to = to - trailing;
    } else if (type !== 'uncovered') {
      result.push({ kind: 'structured', source: blockSource, from: from + leading, to: to - trailing });
    } else {
      result.push({ kind: 'raw', rawKind: 'unknown', source: blockSource, from: from + leading, to: to - trailing });
    }
  };

  let acceptedTo = 0;
  for (const range of ranges) {
    if (range.from < acceptedTo) continue;
    if (range.from > acceptedTo) append(source.slice(acceptedTo, range.from), acceptedTo, range.from, 'uncovered');
    append(source.slice(range.from, range.to), range.from, range.to, range.token.type, range.token.info || '');
    acceptedTo = range.to;
  }

  if (acceptedTo < source.length) append(source.slice(acceptedTo), acceptedTo, source.length, 'uncovered');

  if (result.length === 0) {
    const blockSource = source.replace(/(?:\r?\n)+$/u, '');
    return [{
      kind: 'raw',
      rawKind: rawKindFor('uncovered', blockSource) || 'unknown',
      source: blockSource,
      from: 0,
      to: source.length,
    }];
  }
  return result;
}
