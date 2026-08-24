import { useEffect, useRef } from 'react';
import { baseKeymap } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useAppStore } from '../../stores/appStore';
import type { MarkdownCapability } from '../../types/blockEditor.ts';
import { createBlockEditorController } from '../../utils/blockEditorController.ts';
import { parseMarkdown, serializeMarkdown } from '../../utils/markdownBlockCodec.ts';
import { createBlockInputRules } from './blockInputRules.ts';
import { blockSchema } from './blockSchema.ts';
import { EditorUnsupportedNotice } from './EditorUnsupportedNotice.tsx';
import './BlockEditor.css';

export interface BlockEditorProps {
  markdown: string;
  className?: string;
  style?: React.CSSProperties;
  onMarkdownChange: (markdown: string) => void;
  onUnsupportedMarkdown: (capability: MarkdownCapability) => void;
  onActiveLineChange?: (lineNumber: number) => void;
  onActiveLineReveal?: (lineNumber: number) => void;
  onSwitchToSource?: () => void;
}

function applyBlockMetadata(view: EditorView) {
  const parsed = parseMarkdown(serializeMarkdown(view.state.doc));
  const blocks = parsed.sourceMap?.blocks || [];
  Array.from(view.dom.children).forEach((element, index) => {
    const block = blocks[index];
    if (!block) return;
    const node = element as HTMLElement;
    node.dataset.blockId = block.blockId;
    node.dataset.sourceLine = String(block.lineFrom);
  });
}

function createBlockPlugins() {
  return [
    history(),
    createBlockInputRules(),
    keymap(baseKeymap),
    dropCursor(),
    gapCursor(),
  ];
}

export function BlockEditor({
  markdown,
  className,
  style,
  onMarkdownChange,
  onUnsupportedMarkdown,
  onActiveLineChange,
  onActiveLineReveal,
  onSwitchToSource,
}: BlockEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const controllerRef = useRef<ReturnType<typeof createBlockEditorController> | null>(null);
  const initializingRef = useRef(true);
  const { setEditorView } = useAppStore();
  const parsed = parseMarkdown(markdown);

  useEffect(() => {
    if (!rootRef.current || !parsed.document || parsed.mode !== 'blocks') return undefined;
    const host = rootRef.current;
    const editorHost = document.createElement('div');
    editorHost.className = 'block-editor-content';
    host.appendChild(editorHost);

    const state = EditorState.create({
      schema: blockSchema,
      doc: parsed.document,
      plugins: createBlockPlugins(),
    });

    const publish = (value: string) => {
      if (!initializingRef.current && value !== useAppStore.getState().content) onMarkdownChange(value);
    };

    const view = new EditorView(editorHost, {
      state,
      dispatchTransaction: transaction => {
        const nextState = view.state.apply(transaction);
        view.updateState(nextState);
        if (transaction.docChanged) publish(serializeMarkdown(nextState.doc));
        const active = controllerRef.current?.getSelection();
        if (active) {
          const line = controllerRef.current?.lineAt(active.from).number || 1;
          onActiveLineChange?.(line);
          if (transaction.selectionSet) onActiveLineReveal?.(line);
        }
        applyBlockMetadata(view);
      },
    });
    viewRef.current = view;
    applyBlockMetadata(view);

    const controller = createBlockEditorController(view, host, {
      onMarkdownChange: publish,
      onUnsupportedMarkdown,
      onActiveSourceLine: line => {
        onActiveLineChange?.(line);
        onActiveLineReveal?.(line);
      },
    });
    controllerRef.current = controller;
    setEditorView(controller);
    initializingRef.current = false;

    return () => {
      setEditorView(null);
      controllerRef.current = null;
      viewRef.current?.destroy();
      viewRef.current = null;
      editorHost.remove();
    };
  }, [onActiveLineChange, onActiveLineReveal, onMarkdownChange, onUnsupportedMarkdown, setEditorView]);

  useEffect(() => {
    const view = viewRef.current;
    const parsedExternal = parseMarkdown(markdown);
    if (!view || initializingRef.current || parsedExternal.mode !== 'blocks' || !parsedExternal.document) return;
    if (serializeMarkdown(view.state.doc) === serializeMarkdown(parsedExternal.document)) return;
    view.updateState(EditorState.create({
      schema: blockSchema,
      doc: parsedExternal.document,
      plugins: createBlockPlugins(),
    }));
    applyBlockMetadata(view);
  }, [markdown]);

  if (parsed.mode !== 'blocks' || !parsed.document) {
    return (
      <div className={`editor-container block-editor-container ${className || ''}`} style={style}>
        <EditorUnsupportedNotice capability={parsed.capability} onSwitchToSource={onSwitchToSource} />
      </div>
    );
  }

  return (
    <div className={`editor-container block-editor-container ${className || ''}`} style={style}>
      <div className="editor-document-card block-editor-document-card">
        <div ref={rootRef} className="block-editor-scroll" aria-label="块编辑器" />
      </div>
    </div>
  );
}
