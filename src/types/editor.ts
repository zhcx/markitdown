export interface EditorSelectionRange {
  from: number;
  to: number;
  empty: boolean;
}

export interface EditorLine {
  from: number;
  to: number;
  number: number;
  text: string;
}

export interface EditorDispatchSelection {
  anchor?: number;
  head?: number;
  from?: number;
  to?: number;
  main?: EditorDispatchSelection;
}

export interface EditorDispatchSpec {
  changes?: { from: number; to?: number; insert?: string };
  selection?: EditorDispatchSelection;
  scrollIntoView?: boolean;
}

export interface EditorLineLayout {
  top: number;
  bottom: number;
}

export interface EditorController {
  kind: 'source' | 'blocks';
  scrollDOM: HTMLElement;
  getScrollTop: () => number;
  getScrollHeight: () => number;
  getClientHeight: () => number;
  getTopForLineNumber: (lineNumber: number) => number;
  /**
   * Batch layout lookup for scroll anchoring. Returns the content-top and
   * content-bottom offsets for each requested line so the preview can pair
   * each block's first/last line without per-line DOM queries. Falls back to
   * getTopForLineNumber in callers when absent.
   */
  getLineLayouts?: (lineNumbers: Iterable<number>) => Map<number, EditorLineLayout>;
  setScrollTop: (top: number) => void;
  onScroll: (listener: () => void) => () => void;
  /** CodeMirror-compatible facade kept for existing toolbar and AI integrations. */
  state: {
    selection: { main: EditorSelectionRange };
    sliceDoc: (from: number, to: number) => string;
    doc: {
      length: number;
      lines: number;
      lineAt: (offset: number) => EditorLine;
      line: (lineNumber: number) => EditorLine;
    };
    update: (spec: EditorDispatchSpec) => EditorDispatchSpec;
  };
  dispatch: (spec: EditorDispatchSpec) => void;
  getValue: () => string;
  getSelection: () => EditorSelectionRange;
  getText: (from: number, to: number) => string;
  replaceRange: (from: number, to: number, text: string, selection?: { from: number; to: number }) => void;
  setSelection: (from: number, to?: number) => void;
  lineAt: (offset: number) => EditorLine;
  line: (lineNumber: number) => EditorLine;
  coordsAtPos: (offset: number) => { left: number; bottom: number; x: number; y: number } | null;
  focus: () => void;
  undo: () => void;
  redo: () => void;
  revealOffset: (offset: number) => void;
}
