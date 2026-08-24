import type { Node } from 'prosemirror-model';
import type { BlockSourceMap } from '../types/blockEditor.ts';
import { buildBlockSourceMap } from './blockSourceMap.ts';
import { serializeMarkdown } from './markdownBlockCodec.ts';

export interface BlockDocumentSnapshot {
  document: Node;
  markdown: string;
  sourceMap: BlockSourceMap;
  version: number;
}

export interface BlockDocumentBridge {
  getSnapshot: () => BlockDocumentSnapshot;
  syncDocument: (document: Node) => BlockDocumentSnapshot;
}

function createSnapshot(document: Node, version: number): BlockDocumentSnapshot {
  const markdown = serializeMarkdown(document);
  return {
    document,
    markdown,
    sourceMap: buildBlockSourceMap(markdown, document),
    version,
  };
}

export function createBlockDocumentBridge(document: Node): BlockDocumentBridge {
  let snapshot = createSnapshot(document, 0);
  return {
    getSnapshot: () => snapshot,
    syncDocument: (nextDocument) => {
      const markdown = serializeMarkdown(nextDocument);
      if (markdown === snapshot.markdown) return snapshot;
      snapshot = {
        document: nextDocument,
        markdown,
        sourceMap: buildBlockSourceMap(markdown, nextDocument),
        version: snapshot.version + 1,
      };
      return snapshot;
    },
  };
}
