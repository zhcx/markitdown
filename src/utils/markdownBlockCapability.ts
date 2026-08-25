import type { MarkdownCapability, RawMarkdownKind } from '../types/blockEditor.ts';
import { segmentMarkdown } from './markdownBlockSegments.ts';

export function inspectMarkdownCapability(source: string): MarkdownCapability {
  try {
    const rawKinds: RawMarkdownKind[] = [];
    for (const segment of segmentMarkdown(source)) {
      if (segment.kind === 'raw' && !rawKinds.includes(segment.rawKind)) rawKinds.push(segment.rawKind);
    }
    return {
      supported: true,
      unsupported: [],
      rawKinds,
      message: rawKinds.length ? `块模式将以源码保真块承载：${rawKinds.join('、')}` : '',
    };
  } catch {
    return {
      supported: false,
      unsupported: ['unknown'],
      rawKinds: [],
      message: '该文档无法安全初始化块模式，请使用源码模式。',
    };
  }
}
