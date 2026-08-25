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
  syncDocument: (document: Node, source?: string) => BlockDocumentSnapshot;
}

// The sourceMap's lineFrom/lineTo are the anchor coordinates that the
// preview's [data-source-line] attributes are compared against. Those
// attributes are derived from the markdown string the user is editing, so
// the sourceMap MUST be anchored against that same string — never against a
// ProseMirror round-trip that may have re-formatted blank lines, list
// markers or raw HTML blocks and shifted every line number. Callers pass the
// user-authored source through on every sync (initial mount, replaceRange,
// external markdown replacement); doc-only mutations (task toggle, undo)
// fall back to serializing the doc, which for those no-op structural changes
// preserves line numbers.
function createSnapshot(document: Node, version: number, source: string): BlockDocumentSnapshot {
  return {
    document,
    markdown: source,
    sourceMap: buildBlockSourceMap(source, document),
    version,
  };
}

export function createBlockDocumentBridge(document: Node, initialSource?: string): BlockDocumentBridge {
  let snapshot = createSnapshot(document, 0, initialSource ?? serializeMarkdown(document));
  return {
    getSnapshot: () => snapshot,
    syncDocument: (nextDocument, nextSource) => {
      if (nextDocument === snapshot.document || nextDocument.eq(snapshot.document)) return snapshot;
      const source = nextSource ?? serializeMarkdown(nextDocument);
      snapshot = createSnapshot(nextDocument, snapshot.version + 1, source);
      return snapshot;
    },
  };
}
