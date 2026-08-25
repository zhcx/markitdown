import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history } from 'prosemirror-history';
import { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { useAppStore } from '../../stores/appStore';
import { useAIStore } from '../../stores/aiStore';
import { createBlockEditorController } from '../../utils/blockEditorController.ts';
import {
  EDITOR_COMMANDS,
  filterEditorCommands,
  getEditorCommandAvailability,
  type EditorCommandContext,
  type EditorCommandDefinition,
} from '../../utils/editorCommandRegistry.ts';
import { runAIEditorCommand } from '../../utils/aiEditorCommands.ts';
import { parseMarkdown, serializeMarkdown } from '../../utils/markdownBlockCodec.ts';
import { findSlashCommandTrigger } from '../../utils/slashCommands.ts';
import { changeBlockTypeAtIndex, changeCurrentBlockType } from './blockCommands.ts';
import { createBlockInputRules } from './blockInputRules.ts';
import { createBlockKeymap } from './blockKeymap.ts';
import { blockSchema } from './blockSchema.ts';
import { BlockPropertyMenu } from './BlockPropertyMenu.tsx';
import { EditorUnsupportedNotice } from './EditorUnsupportedNotice.tsx';
import { SlashCommandMenu, type SlashMenuAnchor } from './SlashCommandMenu.tsx';
import './BlockEditor.css';

export interface BlockEditorProps {
  markdown: string;
  className?: string;
  style?: React.CSSProperties;
  onMarkdownChange: (markdown: string) => void;
  onUnsupportedMarkdown: (markdown: string) => void;
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

function createBlockMetadataPlugin() {
  return new Plugin({
    props: {
      decorations(state) {
        const blocks = parseMarkdown(serializeMarkdown(state.doc)).sourceMap?.blocks || [];
        const decorations: Decoration[] = [];
        state.doc.forEach((node, offset, index) => {
          const block = blocks[index];
          if (!block) return;
          const attrs: Record<string, string> = {
            'data-block-id': block.blockId,
            'data-source-line': String(block.lineFrom),
          };
          if (node.type.name === 'raw_markdown') attrs['data-raw-kind'] = String(node.attrs.kind);
          decorations.push(Decoration.node(offset, offset + node.nodeSize, attrs));
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

function createTaskCheckboxPlugin() {
  return new Plugin({
    props: {
      handleDOMEvents: {
        click(view, event) {
          const target = event.target instanceof Element ? event.target : null;
          const checkbox = target?.closest<HTMLInputElement>('.task-checkbox input[type="checkbox"]');
          const itemContent = checkbox?.closest<HTMLElement>('.task-item')
            ?.querySelector<HTMLElement>('.task-item-content');
          if (!checkbox || !itemContent) return false;
          const nodePosition = view.posAtDOM(itemContent, 0) - 1;
          const node = view.state.doc.nodeAt(nodePosition);
          if (!node || node.type.name !== 'task_item') return false;
          view.dispatch(view.state.tr.setNodeMarkup(nodePosition, undefined, {
            ...node.attrs,
            checked: !node.attrs.checked,
          }));
          return true;
        },
      },
    },
  });
}

function createBlockPlugins() {
  return [
    history(),
    createBlockMetadataPlugin(),
    createTaskCheckboxPlugin(),
    createBlockInputRules(),
    createBlockKeymap(),
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
  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const controllerRef = useRef<ReturnType<typeof createBlockEditorController> | null>(null);
  const initializingRef = useRef(true);
  const slashMenuRef = useRef<SlashMenuState | null>(null);
  const slashSelectedIndexRef = useRef(0);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [blockHandle, setBlockHandle] = useState<BlockHandleState | null>(null);
  const [blockPropertyMenu, setBlockPropertyMenu] = useState<BlockPropertyMenuState | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const aiEnabled = useAppStore(state => state.settings.ai.enabled);
  const aiConfigured = useAppStore(state => Boolean(state.settings.ai.api_key.trim()));
  const parsed = parseMarkdown(markdown);
  const parsedRef = useRef(parsed);
  const markdownRef = useRef(markdown);
  const isBlockMode = parsed.mode === 'blocks' && !!parsed.document;
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  const onUnsupportedMarkdownRef = useRef(onUnsupportedMarkdown);
  const onActiveLineChangeRef = useRef(onActiveLineChange);
  const onActiveLineRevealRef = useRef(onActiveLineReveal);
  useEffect(() => {
    parsedRef.current = parsed;
    markdownRef.current = markdown;
    onMarkdownChangeRef.current = onMarkdownChange;
    onUnsupportedMarkdownRef.current = onUnsupportedMarkdown;
    onActiveLineChangeRef.current = onActiveLineChange;
    onActiveLineRevealRef.current = onActiveLineReveal;
  }, [markdown, onActiveLineChange, onActiveLineReveal, onMarkdownChange, onUnsupportedMarkdown, parsed]);
  const commandContext = useMemo<EditorCommandContext>(() => ({
    mode: 'blocks',
    aiEnabled,
    aiConfigured,
  }), [aiConfigured, aiEnabled]);
  const slashCommands = useMemo(
    () => filterEditorCommands(slashMenu?.query || '', EDITOR_COMMANDS.filter(command => command.surfaces.includes('slash'))),
    [slashMenu?.query],
  );
  const blockMenuCommands = useMemo(
    () => EDITOR_COMMANDS.filter(command => command.surfaces.includes('block-menu')),
    [],
  );

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
      left: blockRect.left - rootRect.left + root.scrollLeft - 40,
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
  const syncSlashMenuRef = useRef(syncSlashMenu);
  useEffect(() => {
    syncSlashMenuRef.current = syncSlashMenu;
  }, [syncSlashMenu]);

  const applyBlockProperty = useCallback(async (command: EditorCommandDefinition) => {
    const controller = controllerRef.current;
    const view = viewRef.current;
    if (!controller || !view || !blockPropertyMenu) return;
    if (!getEditorCommandAvailability(command, commandContext).enabled) return;

    if (command.aiAction) {
      const snapshot = controller.syncDocument();
      const block = snapshot.sourceMap.blocks[blockPropertyMenu.index];
      if (block) controller.setSelection(block.sourceFrom, block.sourceTo);
      await runAIEditorCommand(command.aiAction, controller);
    } else if (command.blockAction?.kind === 'turn-into') {
      if (command.blockAction.type === 'heading') {
        changeBlockTypeAtIndex(blockPropertyMenu.index, 'heading', { level: command.blockAction.level })(view.state, view.dispatch);
      } else {
        changeBlockTypeAtIndex(blockPropertyMenu.index, command.blockAction.type)(view.state, view.dispatch);
      }
    } else if (command.blockAction?.kind === 'insert' && command.blockAction.type !== 'image') {
      changeBlockTypeAtIndex(blockPropertyMenu.index, command.blockAction.type)(view.state, view.dispatch);
    }
    syncSlashMenu();
  }, [blockPropertyMenu, commandContext, syncSlashMenu]);

  const applySlashCommand = useCallback(async (command: EditorCommandDefinition) => {
    const menu = slashMenuRef.current;
    const controller = controllerRef.current;
    if (!menu || !controller) return;
    if (!getEditorCommandAvailability(command, commandContext).enabled) return;
    closeSlashMenu();
    controller.replaceRange(menu.from, menu.to, '');
    try {
      if (command.aiAction) {
        await runAIEditorCommand(command.aiAction, controller);
      } else if (command.blockAction && command.blockAction.type !== 'image') {
        const view = viewRef.current;
        if (view) {
          if (command.blockAction.kind === 'turn-into' && command.blockAction.type === 'heading') {
            changeCurrentBlockType('heading', { level: command.blockAction.level })(view.state, view.dispatch);
          } else {
            changeCurrentBlockType(command.blockAction.type)(view.state, view.dispatch);
          }
        }
      } else if (command.insertion) {
        const { text, selectionStart = text.length, selectionEnd = selectionStart } = command.insertion;
        controller.replaceRange(menu.from, menu.from, text, {
          from: menu.from + selectionStart,
          to: menu.from + selectionEnd,
        });
      }
    } catch (error) {
      useAIStore.getState().setStatus('error', error instanceof Error ? error.message : String(error));
    } finally {
      controller.focus();
    }
  }, [closeSlashMenu, commandContext]);

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
      void applySlashCommand(slashCommands[slashSelectedIndexRef.current]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSlashMenu();
    }
  }, [applySlashCommand, closeSlashMenu, slashCommands]);

  useEffect(() => {
    const currentParsed = parsedRef.current;
    if (!isBlockMode || !rootRef.current || !editorHostRef.current || !currentParsed.document || currentParsed.mode !== 'blocks') return undefined;
    const host = rootRef.current;
    initializingRef.current = true;
    let createdView: EditorView | null = null;
    try {
      const state = EditorState.create({
        schema: blockSchema,
        doc: currentParsed.document,
        plugins: createBlockPlugins(),
      });

      const publish = (value: string) => {
        if (!initializingRef.current && value !== useAppStore.getState().content) onMarkdownChangeRef.current(value);
      };

      const view = new EditorView({ mount: editorHostRef.current }, {
        state,
        dispatchTransaction: transaction => {
          const nextState = view.state.apply(transaction);
          view.updateState(nextState);
          const snapshot = controllerRef.current?.syncDocument();
          if (transaction.docChanged && snapshot) publish(snapshot.markdown);
          const controller = controllerRef.current;
          const active = controller?.getSelection();
          if (active) {
            const line = controller.lineAt(active.from).number;
            onActiveLineChangeRef.current?.(line);
            if (transaction.selectionSet) onActiveLineRevealRef.current?.(line);
          }
          syncSlashMenuRef.current();
        },
      });
      createdView = view;
      viewRef.current = view;

      const controller = createBlockEditorController(view, host, {
        onMarkdownChange: publish,
        onUnsupportedMarkdown: nextSource => onUnsupportedMarkdownRef.current(nextSource),
        onActiveSourceLine: line => {
          onActiveLineChangeRef.current?.(line);
          onActiveLineRevealRef.current?.(line);
        },
      }, markdownRef.current);
      controllerRef.current = controller;
      useAppStore.getState().setEditorView(controller);
      initializingRef.current = false;

      return () => {
        useAppStore.getState().setEditorView(null);
        controllerRef.current = null;
        viewRef.current?.destroy();
        viewRef.current = null;
      };
    } catch (error) {
      createdView?.destroy();
      viewRef.current = null;
      controllerRef.current = null;
      initializingRef.current = false;
      const message = error instanceof Error ? error.message : String(error);
      queueMicrotask(() => setInitializationError(message));
      onUnsupportedMarkdownRef.current(markdownRef.current);
      return undefined;
    }
  }, [isBlockMode]);

  useEffect(() => {
    const view = viewRef.current;
    const controller = controllerRef.current;
    const parsedExternal = parseMarkdown(markdown);
    if (!view || !controller || initializingRef.current || parsedExternal.mode !== 'blocks' || !parsedExternal.document) return;
    if (controller.getValue() === markdown) return;
    const selection = controller.getSelection();
    view.updateState(EditorState.create({
      schema: blockSchema,
      doc: parsedExternal.document,
      plugins: createBlockPlugins(),
    }));
    // Anchor the sourceMap against the external markdown string — the same
    // string the preview derives its [data-source-line] anchors from — so the
    // block line numbers stay in lockstep with the preview after an external
    // document replacement.
    controller.syncDocument(markdown);
    controller.setSelection(selection.from, selection.to);
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

  if (initializationError || parsed.mode !== 'blocks' || !parsed.document) {
    return (
      <div className={`editor-container block-editor-container ${className || ''}`} style={style}>
        <EditorUnsupportedNotice capability={parsed.capability} reason={initializationError} onSwitchToSource={onSwitchToSource} />
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
          <div ref={editorHostRef} className="block-editor-content" />
          <div className="block-editor-overlay">
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
      </div>
      {blockPropertyMenu && (
        <BlockPropertyMenu
          left={blockPropertyMenu.left}
          top={blockPropertyMenu.top}
          commands={blockMenuCommands}
          context={commandContext}
          onSelect={command => { void applyBlockProperty(command); }}
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
          context={commandContext}
        />
      )}
    </div>
  );
}
