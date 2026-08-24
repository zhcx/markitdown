import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { filterSlashCommands, findSlashCommandTrigger, type SlashCommand } from '../../utils/slashCommands.ts';
import { changeCurrentBlockType } from './blockCommands.ts';
import { createBlockInputRules } from './blockInputRules.ts';
import { blockSchema } from './blockSchema.ts';
import { BlockPropertyMenu, type BlockPropertySelection } from './BlockPropertyMenu.tsx';
import { EditorUnsupportedNotice } from './EditorUnsupportedNotice.tsx';
import { SlashCommandMenu, type SlashMenuAnchor } from './SlashCommandMenu.tsx';
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

interface SlashMenuState {
  from: number;
  to: number;
  query: string;
  anchor: SlashMenuAnchor;
}

interface BlockHandleState {
  blockId: string;
  index: number;
  left: number;
  top: number;
}

interface BlockPropertyMenuState {
  index: number;
  left: number;
  top: number;
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
  const slashMenuRef = useRef<SlashMenuState | null>(null);
  const slashSelectedIndexRef = useRef(0);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [blockHandle, setBlockHandle] = useState<BlockHandleState | null>(null);
  const [blockPropertyMenu, setBlockPropertyMenu] = useState<BlockPropertyMenuState | null>(null);
  const { setEditorView } = useAppStore();
  const parsed = parseMarkdown(markdown);
  const initialParsedRef = useRef(parsed);
  const slashCommands = useMemo(() => filterSlashCommands(slashMenu?.query || ''), [slashMenu?.query]);

  const updateBlockHandle = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.block-handle')) return;
    const block = target?.closest<HTMLElement>('.block-editor-content > [data-block-id]');
    const root = rootRef.current;
    if (!block || !root) return;
    const rootRect = root.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const index = Array.from(block.parentElement?.children || []).indexOf(block);
    setBlockHandle({
      blockId: block.dataset.blockId || '',
      index,
      left: blockRect.left - rootRect.left + root.scrollLeft - 30,
      top: blockRect.top - rootRect.top + root.scrollTop + 2,
    });
  }, []);

  const closeSlashMenu = useCallback(() => {
    slashMenuRef.current = null;
    setSlashMenu(null);
    setSlashSelectedIndex(0);
  }, []);

  const syncSlashMenu = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const selection = controller.getSelection();
    if (!selection.empty) {
      closeSlashMenu();
      return;
    }
    const line = controller.lineAt(selection.to);
    const trigger = findSlashCommandTrigger(line.text, line.from, selection.to);
    const coords = controller.coordsAtPos(selection.to);
    if (!trigger || !coords) {
      closeSlashMenu();
      return;
    }
    const nextMenu: SlashMenuState = {
      from: trigger.from,
      to: trigger.to,
      query: trigger.query,
      anchor: { left: coords.left, top: coords.bottom - 24, bottom: coords.bottom },
    };
    slashMenuRef.current = nextMenu;
    setSlashMenu(nextMenu);
  }, [closeSlashMenu]);

  const applyBlockProperty = useCallback((selection: BlockPropertySelection) => {
    const view = viewRef.current;
    if (!view) return;
    changeCurrentBlockType(selection.type, selection.attrs)(view.state, view.dispatch);
    applyBlockMetadata(view);
    syncSlashMenu();
  }, [syncSlashMenu]);

  const applySlashCommand = useCallback((command: SlashCommand) => {
    const menu = slashMenuRef.current;
    const controller = controllerRef.current;
    if (!menu || !controller) return;
    closeSlashMenu();
    if (
      command.blockAction?.kind === 'turn-into'
      || (command.blockAction?.kind === 'insert' && command.blockAction.type !== 'image')
    ) {
      const view = viewRef.current;
      if (view) {
        const action = command.blockAction;
        if (action?.kind === 'turn-into') {
          changeCurrentBlockType('heading', { level: action.level })(view.state, view.dispatch);
        } else if (action?.kind === 'insert' && action.type !== 'image') {
          changeCurrentBlockType(action.type)(view.state, view.dispatch);
        }
        applyBlockMetadata(view);
      }
    } else {
      const { text, selectionStart = text.length, selectionEnd = selectionStart } = command.insertion;
      controller.replaceRange(menu.from, menu.to, text, {
        from: menu.from + selectionStart,
        to: menu.from + selectionEnd,
      });
    }
    controller.focus();
  }, [closeSlashMenu]);

  const handleSlashKeyDown = useCallback((event: KeyboardEvent) => {
    if (!slashMenuRef.current || slashCommands.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = (slashSelectedIndexRef.current + 1) % slashCommands.length;
      slashSelectedIndexRef.current = next;
      setSlashSelectedIndex(next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (slashSelectedIndexRef.current - 1 + slashCommands.length) % slashCommands.length;
      slashSelectedIndexRef.current = next;
      setSlashSelectedIndex(next);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      applySlashCommand(slashCommands[slashSelectedIndexRef.current]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSlashMenu();
    }
  }, [applySlashCommand, closeSlashMenu, slashCommands]);

  useEffect(() => {
    const initialParsed = initialParsedRef.current;
    if (!rootRef.current || !initialParsed.document || initialParsed.mode !== 'blocks') return undefined;
    const host = rootRef.current;
    const editorHost = document.createElement('div');
    editorHost.className = 'block-editor-content';
    host.appendChild(editorHost);

    const state = EditorState.create({
      schema: blockSchema,
      doc: initialParsed.document,
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
        syncSlashMenu();
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
  }, [onActiveLineChange, onActiveLineReveal, onMarkdownChange, onUnsupportedMarkdown, setEditorView, syncSlashMenu]);

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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    root.addEventListener('keydown', handleSlashKeyDown);
    return () => root.removeEventListener('keydown', handleSlashKeyDown);
  }, [handleSlashKeyDown]);

  useEffect(() => {
    if (!blockPropertyMenu) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.block-property-menu, .block-handle')) setBlockPropertyMenu(null);
    };
    window.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, [blockPropertyMenu]);

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
        <div
          ref={rootRef}
          className="block-editor-scroll"
          aria-label="块编辑器"
          onMouseMove={updateBlockHandle}
          onMouseLeave={() => {
            if (!blockPropertyMenu) setBlockHandle(null);
          }}
        >
          {blockHandle && (
            <button
              type="button"
              className="block-handle"
              aria-label="打开块属性"
              title="块属性"
              style={{ left: blockHandle.left, top: blockHandle.top }}
              onMouseDown={event => event.preventDefault()}
              onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect();
                setBlockPropertyMenu({ index: blockHandle.index, left: rect.right + 8, top: rect.top });
              }}
            >
              ⋮⋮
            </button>
          )}
        </div>
      </div>
      {blockPropertyMenu && (
        <BlockPropertyMenu
          left={blockPropertyMenu.left}
          top={blockPropertyMenu.top}
          onSelect={applyBlockProperty}
          onClose={() => setBlockPropertyMenu(null)}
        />
      )}
      {slashMenu && (
        <SlashCommandMenu
          anchor={slashMenu.anchor}
          commands={slashCommands}
          selectedIndex={Math.min(slashSelectedIndex, Math.max(0, slashCommands.length - 1))}
          query={slashMenu.query}
          onSelect={applySlashCommand}
          onSelectedIndexChange={(index) => {
            slashSelectedIndexRef.current = index;
            setSlashSelectedIndex(index);
          }}
          onClose={closeSlashMenu}
        />
      )}
    </div>
  );
}
