import { redo, undo } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { BlockSourceMap, MarkdownCapability } from '../types/blockEditor.ts';
import type { EditorController, EditorDispatchSpec, EditorLine, EditorSelectionRange } from '../types/editor.ts';
import { parseMarkdown } from './markdownBlockCodec.ts';
import { createBlockDocumentBridge, type BlockDocumentSnapshot } from './blockDocumentBridge.ts';

interface BlockEditorRoot extends HTMLElement {
  querySelector<E extends Element = Element>(selectors: string): E | null;
}

export interface BlockControllerHost {
  onMarkdownChange: (markdown: string) => void;
  onUnsupportedMarkdown: (capability: MarkdownCapability) => void;
  onActiveSourceLine: (lineNumber: number) => void;
}

export interface BlockEditorController extends EditorController {
  syncDocument: (document: Node) => BlockDocumentSnapshot;
}

function lineAt(source: string, lineNumber: number): EditorLine {
  const lines = source.split('\n');
  const number = Math.max(1, Math.min(lineNumber, lines.length));
  const from = lines.slice(0, number - 1).reduce((total, line) => total + line.length + 1, 0);
  const text = lines[number - 1] || '';
  return { number, from, to: from + text.length, text };
}

function lineForOffset(source: string, offset: number) {
  return source.slice(0, Math.max(0, Math.min(source.length, offset))).split('\n').length;
}

function topNodeStart(document: Node, index: number) {
  let position = 0;
  for (let current = 0; current < index; current += 1) position += document.child(current).nodeSize;
  return position + 1;
}

function textPrefixForBlock(source: string, map: BlockSourceMap, index: number, node: Node) {
  const block = map.blocks[index];
  if (!block) return 0;
  const blockText = source.slice(block.sourceFrom, block.sourceTo);
  const text = node.textContent;
  if (!text) return 0;
  const prefix = blockText.indexOf(text);
  return prefix >= 0 ? prefix : 0;
}

function sourceOffsetForPosition(state: EditorState, source: string, map: BlockSourceMap, position: number) {
  const resolved = state.doc.resolve(Math.max(0, Math.min(position, state.doc.content.size)));
  const index = resolved.depth > 0 ? resolved.index(0) : Math.max(0, Math.min(map.blocks.length - 1, resolved.index(0)));
  const block = map.blocks[index];
  if (!block) return 0;
  const node = state.doc.child(index);
  const prefix = textPrefixForBlock(source, map, index, node);
  const parentTextBefore = resolved.depth > 0 ? resolved.parent.textBetween(0, resolved.parentOffset, '\n') : '';
  const blockText = source.slice(block.sourceFrom, block.sourceTo);
  const textOffset = parentTextBefore ? Math.max(0, blockText.indexOf(parentTextBefore) + parentTextBefore.length) : prefix;
  return Math.max(block.sourceFrom, Math.min(block.sourceTo, block.sourceFrom + Math.max(prefix, textOffset)));
}

function positionForSourceOffset(state: EditorState, source: string, map: BlockSourceMap, offset: number) {
  const block = map.blockForSourceOffset(offset);
  if (!block) return 1;
  const index = map.blocks.indexOf(block);
  const node = state.doc.child(Math.max(0, index));
  const prefix = textPrefixForBlock(source, map, index, node);
  const localTextOffset = Math.max(0, Math.min(node.textContent.length, offset - block.sourceFrom - prefix));
  return Math.min(state.doc.content.size, topNodeStart(state.doc, index) + localTextOffset);
}

export function createBlockEditorController(
  view: EditorView,
  root: BlockEditorRoot,
  host: BlockControllerHost,
): BlockEditorController {
  const bridge = createBlockDocumentBridge(view.state.doc);

  const getSelection = (): EditorSelectionRange => {
    const snapshot = bridge.getSnapshot();
    const from = sourceOffsetForPosition(view.state, snapshot.markdown, snapshot.sourceMap, view.state.selection.from);
    const to = sourceOffsetForPosition(view.state, snapshot.markdown, snapshot.sourceMap, view.state.selection.to);
    return { from, to, empty: from === to };
  };

  const updateSource = (nextSource: string, selection?: { from: number; to: number }) => {
    const parsed = parseMarkdown(nextSource);
    if (parsed.mode === 'source' || !parsed.document) {
      host.onMarkdownChange(nextSource);
      host.onUnsupportedMarkdown(parsed.capability);
      return;
    }
    const transaction = view.state.tr.replaceWith(0, view.state.doc.content.size, parsed.document.content);
    view.dispatch(transaction);
    bridge.syncDocument(view.state.doc);
    const snapshot = bridge.getSnapshot();
    host.onMarkdownChange(snapshot.markdown);
    const nextSelection = selection || { from: 0, to: 0 };
    const anchor = positionForSourceOffset(view.state, snapshot.markdown, snapshot.sourceMap, nextSelection.from);
    const head = positionForSourceOffset(view.state, snapshot.markdown, snapshot.sourceMap, nextSelection.to);
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.max(1, Math.min(view.state.doc.content.size, anchor))))));
    if (head !== anchor) {
      view.dispatch(view.state.tr.setSelection(TextSelection.between(
        view.state.doc.resolve(Math.max(1, Math.min(view.state.doc.content.size, anchor))),
        view.state.doc.resolve(Math.max(1, Math.min(view.state.doc.content.size, head))),
      )));
    }
    host.onActiveSourceLine(lineForOffset(snapshot.markdown, nextSelection.from));
  };

  const setSelection = (from: number, to = from) => {
    const snapshot = bridge.getSnapshot();
    const anchor = positionForSourceOffset(view.state, snapshot.markdown, snapshot.sourceMap, from);
    const head = positionForSourceOffset(view.state, snapshot.markdown, snapshot.sourceMap, to);
    const selection = TextSelection.between(
      view.state.doc.resolve(Math.max(1, Math.min(view.state.doc.content.size, anchor))),
      view.state.doc.resolve(Math.max(1, Math.min(view.state.doc.content.size, head))),
    );
    view.dispatch(view.state.tr.setSelection(selection));
  };

  const applyDispatch = (spec: EditorDispatchSpec) => {
    const snapshot = bridge.getSnapshot();
    if (spec.changes && typeof spec.changes.from === 'number') {
      const from = Math.max(0, Math.min(snapshot.markdown.length, spec.changes.from));
      const to = Math.max(from, Math.min(snapshot.markdown.length, spec.changes.to ?? from));
      const nextSource = snapshot.markdown.slice(0, from) + (spec.changes.insert ?? '') + snapshot.markdown.slice(to);
      const cursor = from + (spec.changes.insert ?? '').length;
      updateSource(nextSource, { from: cursor, to: cursor });
    }
    const selected = spec.selection?.main || spec.selection;
    const anchor = selected?.anchor ?? selected?.from;
    const head = selected?.head ?? selected?.to ?? anchor;
    if (typeof anchor === 'number') setSelection(anchor, head);
    if (spec.scrollIntoView && typeof anchor === 'number') view.dispatch(view.state.tr.scrollIntoView());
  };

  const controller = {
    kind: 'blocks' as const,
    syncDocument: (document: Node) => bridge.syncDocument(document),
    scrollDOM: root.querySelector<HTMLElement>('.block-editor-scroll') || root,
    getScrollTop: () => controller.scrollDOM.scrollTop || 0,
    getScrollHeight: () => controller.scrollDOM.scrollHeight || 0,
    getClientHeight: () => controller.scrollDOM.clientHeight || 0,
    getTopForLineNumber: (lineNumber: number) => {
      const snapshot = bridge.getSnapshot();
      const block = snapshot.sourceMap.blocks.find(item => lineNumber >= item.lineFrom && lineNumber <= item.lineTo)
        || snapshot.sourceMap.blocks.reduce((closest, item) => Math.abs(item.lineFrom - lineNumber) < Math.abs(closest.lineFrom - lineNumber) ? item : closest, snapshot.sourceMap.blocks[0]);
      const element = block ? root.querySelector<HTMLElement>(`[data-block-id="${block.blockId}"]`) : null;
      if (element) return element.offsetTop;
      const lines = Math.max(1, snapshot.markdown.split('\n').length - 1);
      const max = Math.max(0, controller.getScrollHeight() - controller.getClientHeight());
      return max * Math.max(0, Math.min(1, (lineNumber - 1) / lines));
    },
    setScrollTop: (top: number) => { controller.scrollDOM.scrollTop = top; },
    onScroll: (listener: () => void) => {
      controller.scrollDOM.addEventListener('scroll', listener);
      return () => controller.scrollDOM.removeEventListener('scroll', listener);
    },
    getValue: () => bridge.getSnapshot().markdown,
    getSelection,
    getText: (from: number, to: number) => {
      const snapshot = bridge.getSnapshot();
      return snapshot.markdown.slice(from, to);
    },
    replaceRange: (from: number, to: number, text: string, selection?: { from: number; to: number }) => {
      const snapshot = bridge.getSnapshot();
      const safeFrom = Math.max(0, Math.min(snapshot.markdown.length, from));
      const safeTo = Math.max(safeFrom, Math.min(snapshot.markdown.length, to));
      updateSource(snapshot.markdown.slice(0, safeFrom) + text + snapshot.markdown.slice(safeTo), selection || { from: safeFrom + text.length, to: safeFrom + text.length });
    },
    setSelection,
    lineAt: (offset: number) => {
      const snapshot = bridge.getSnapshot();
      return lineAt(snapshot.markdown, lineForOffset(snapshot.markdown, offset));
    },
    line: (lineNumber: number) => lineAt(bridge.getSnapshot().markdown, lineNumber),
    coordsAtPos: (offset: number) => {
      const snapshot = bridge.getSnapshot();
      const coords = view.coordsAtPos?.(positionForSourceOffset(view.state, snapshot.markdown, snapshot.sourceMap, offset));
      return coords ? { left: coords.left, bottom: coords.bottom, x: coords.left, y: coords.bottom } : null;
    },
    focus: () => view.focus(),
    undo: () => undo(view.state, view.dispatch),
    redo: () => redo(view.state, view.dispatch),
    revealOffset: (offset: number) => {
      setSelection(offset);
      view.dispatch(view.state.tr.scrollIntoView());
    },
    dispatch: applyDispatch,
  } as unknown as BlockEditorController;

  Object.defineProperty(controller, 'state', {
    enumerable: true,
    get: () => ({
      selection: { main: getSelection() },
      sliceDoc: (from: number, to: number) => {
        const snapshot = bridge.getSnapshot();
        return snapshot.markdown.slice(from, to);
      },
      doc: {
        length: bridge.getSnapshot().markdown.length,
        lines: bridge.getSnapshot().markdown.split('\n').length,
        lineAt: (offset: number) => controller.lineAt(offset),
        line: (lineNumber: number) => controller.line(lineNumber),
      },
      update: (spec: EditorDispatchSpec) => spec,
    }),
  });
  return controller;
}
