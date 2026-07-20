import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, type Settings } from '../../stores/appStore';
import { useAIStore, type ProofreadResult } from '../../stores/aiStore';
import type { EditorController, EditorDispatchSpec, EditorLine } from '../../types/editor';
import { EDITOR_OVERFLOW_OPTIONS, EDITOR_UNICODE_HIGHLIGHT_OPTIONS } from '../../utils/editorLayout';
import { filterSlashCommands, findSlashCommandTrigger, type SlashCommand } from '../../utils/slashCommands';
import { SlashCommandMenu, type SlashMenuAnchor } from './SlashCommandMenu';
import { normalizeLanguage, t } from '../../i18n';

(self as typeof self & { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

interface EditorProps {
  className?: string;
  style?: React.CSSProperties;
}

const MIN_AUTO_COMPANION_CHARS = 6;
const AUTO_COMPANION_CONTEXT_LIMIT = 800;
const AUTO_COMPANION_MIN_INTERVAL = 1200;

interface SlashMenuState {
  from: number;
  to: number;
  query: string;
  anchor: SlashMenuAnchor;
}

interface EditorContextMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window;

function imageHostConfigured(settings: Settings) {
  const hosting = settings.image_hosting;
  switch (hosting.active_service) {
    case 'local': return Boolean(hosting.local.save_directory.trim());
    case 'picgo': return Boolean(hosting.picgo.server_url.trim());
    case 'cloudinary': return Boolean(hosting.cloudinary.cloud_name.trim() && hosting.cloudinary.api_key.trim() && hosting.cloudinary.api_secret.trim());
    case 's3': return Boolean(hosting.s3.endpoint.trim() && hosting.s3.bucket.trim() && hosting.s3.access_key.trim() && hosting.s3.secret_key.trim());
    default: return false;
  }
}

function offsetToPosition(model: monaco.editor.ITextModel, offset: number) {
  return model.getPositionAt(Math.max(0, Math.min(offset, model.getValueLength())));
}

function toLine(model: monaco.editor.ITextModel, lineNumber: number): EditorLine {
  const safeLine = Math.max(1, Math.min(lineNumber, model.getLineCount()));
  return {
    number: safeLine,
    from: model.getOffsetAt({ lineNumber: safeLine, column: 1 }),
    to: model.getOffsetAt({ lineNumber: safeLine, column: model.getLineMaxColumn(safeLine) }),
    text: model.getLineContent(safeLine),
  };
}

function createController(editor: monaco.editor.IStandaloneCodeEditor, model: monaco.editor.ITextModel, root: HTMLElement): EditorController {
  const getSelection = () => {
    const selection = editor.getSelection();
    if (!selection) return { from: 0, to: 0, empty: true };
    const from = model.getOffsetAt(selection.getStartPosition());
    const to = model.getOffsetAt(selection.getEndPosition());
    return { from, to, empty: from === to };
  };

  const setSelection = (from: number, to = from) => {
    const start = offsetToPosition(model, from);
    const end = offsetToPosition(model, to);
    editor.setSelection(new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column));
  };

  const applyDispatch = (spec: EditorDispatchSpec) => {
    const change = spec?.changes;
    if (change && typeof change.from === 'number') {
      const text = change.insert ?? '';
      editor.executeEdits('markitdown', [{ range: monaco.Range.fromPositions(offsetToPosition(model, change.from), offsetToPosition(model, change.to ?? change.from)), text, forceMoveMarkers: true }]);
    }
    const selected = spec?.selection?.main || spec?.selection;
    const anchor = selected?.anchor ?? selected?.from;
    const head = selected?.head ?? selected?.to ?? anchor;
    if (typeof anchor === 'number') setSelection(anchor, head);
    if (spec?.scrollIntoView && typeof anchor === 'number') editor.revealPositionInCenter(offsetToPosition(model, anchor));
  };

  const controller = {
    scrollDOM: root.querySelector<HTMLElement>('.monaco-scrollable-element.editor-scrollable') || root,
    getScrollTop: () => editor.getScrollTop(),
    getScrollHeight: () => editor.getScrollHeight(),
    getClientHeight: () => editor.getLayoutInfo().height,
    getTopForLineNumber: (lineNumber: number) => editor.getTopForLineNumber(
      Math.max(1, Math.min(lineNumber, model.getLineCount())),
    ),
    setScrollTop: (top: number) => editor.setScrollTop(top, monaco.editor.ScrollType.Immediate),
    onScroll: (listener: () => void) => {
      const disposable = editor.onDidScrollChange((event) => {
        if (event.scrollTopChanged || event.scrollHeightChanged) listener();
      });
      return () => disposable.dispose();
    },
    getValue: () => model.getValue(),
    getSelection,
    getText: (from, to) => model.getValueInRange(monaco.Range.fromPositions(offsetToPosition(model, from), offsetToPosition(model, to))),
    replaceRange: (from, to, text, selection) => {
      editor.executeEdits('markitdown', [{ range: monaco.Range.fromPositions(offsetToPosition(model, from), offsetToPosition(model, to)), text, forceMoveMarkers: true }]);
      if (selection) setSelection(selection.from, selection.to);
    },
    setSelection,
    lineAt: (offset) => toLine(model, offsetToPosition(model, offset).lineNumber),
    line: (lineNumber) => toLine(model, lineNumber),
    coordsAtPos: (offset) => {
      const position = offsetToPosition(model, offset);
      const visible = editor.getScrolledVisiblePosition(position);
      const node = editor.getDomNode();
      if (!visible || !node) return null;
      const rect = node.getBoundingClientRect();
      const left = rect.left + visible.left;
      const bottom = rect.top + visible.top + visible.height;
      return { left, bottom, x: left, y: bottom };
    },
    focus: () => editor.focus(),
    undo: () => editor.trigger('markitdown', 'undo', null),
    redo: () => editor.trigger('markitdown', 'redo', null),
    revealOffset: (offset) => editor.revealPositionInCenter(offsetToPosition(model, offset)),
    dispatch: applyDispatch,
  } as EditorController;

  Object.defineProperty(controller, 'state', {
    enumerable: true,
    get: () => ({
      selection: { main: getSelection() },
      sliceDoc: (from: number, to: number) => controller.getText(from, to),
      doc: {
        length: model.getValueLength(),
        lines: model.getLineCount(),
        lineAt: (offset: number) => controller.lineAt(offset),
        line: (lineNumber: number) => controller.line(lineNumber),
      },
      update: (spec: unknown) => spec,
    }),
  });
  return controller;
}

async function fileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function Editor({ className, style }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const controllerRef = useRef<EditorController | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const autoCompanionTimerRef = useRef<number | null>(null);
  const autoCompanionLastPromptRef = useRef('');
  const autoCompanionLastRequestAtRef = useRef(0);
  const slashMenuRef = useRef<SlashMenuState | null>(null);
  const slashSelectedIndexRef = useRef(0);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  const { content, setContent, settings, setEditorView } = useAppStore();
  const { proofreadResults } = useAIStore();
  const initialContentRef = useRef(content);
  const slashCommands = useMemo(() => filterSlashCommands(slashMenu?.query || ''), [slashMenu?.query]);
  const language = normalizeLanguage(settings.appearance.language);

  const runContextMenuAction = useCallback(async (action: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll') => {
    const editor = monacoRef.current;
    const model = modelRef.current;
    const controller = controllerRef.current;
    setContextMenu(null);
    if (!editor || !model || !controller) return;

    if (action === 'undo' || action === 'redo') {
      editor.trigger('markitdown-context-menu', action, null);
    } else if (action === 'selectAll') {
      editor.setSelection(model.getFullModelRange());
    } else if (action === 'paste') {
      try {
        const text = await navigator.clipboard.readText();
        const selection = controller.getSelection();
        controller.replaceRange(selection.from, selection.to, text, {
          from: selection.from + text.length,
          to: selection.from + text.length,
        });
      } catch {
        editor.trigger('markitdown-context-menu', 'editor.action.clipboardPasteAction', null);
      }
    } else {
      const selection = controller.getSelection();
      const selectedText = controller.getText(selection.from, selection.to);
      if (!selectedText) return;
      try {
        await navigator.clipboard.writeText(selectedText);
        if (action === 'cut') controller.replaceRange(selection.from, selection.to, '');
      } catch {
        editor.trigger('markitdown-context-menu', `editor.action.clipboard${action === 'cut' ? 'Cut' : 'Copy'}Action`, null);
      }
    }
    editor.focus();
  }, []);

  const closeSlashMenu = useCallback(() => {
    slashMenuRef.current = null;
    setSlashMenu(null);
  }, []);

  const selectSlashIndex = useCallback((index: number) => {
    slashSelectedIndexRef.current = index;
    setSlashSelectedIndex(index);
  }, []);

  const applySlashCommand = useCallback((command: SlashCommand) => {
    const menu = slashMenuRef.current;
    const controller = controllerRef.current;
    if (!menu || !controller) return;

    const { text, selectionStart = text.length, selectionEnd = selectionStart } = command.insertion;
    slashMenuRef.current = null;
    setSlashMenu(null);
    controller.replaceRange(menu.from, menu.to, text, {
      from: menu.from + selectionStart,
      to: menu.from + selectionEnd,
    });
    controller.focus();
  }, []);

  useEffect(() => {
    const root = editorRef.current;
    if (!root || monacoRef.current) return;

    const isDark = (document.documentElement.dataset.theme || '').endsWith('-dark');
    const model = monaco.editor.createModel(initialContentRef.current, 'markdown');
    const editor = monaco.editor.create(root, {
      model,
      theme: isDark ? 'vs-dark' : 'vs',
      automaticLayout: true,
      fontFamily: 'var(--font-content)',
      fontSize: useAppStore.getState().settings.appearance.font_size,
      lineHeight: Math.round(useAppStore.getState().settings.appearance.font_size * useAppStore.getState().settings.appearance.line_height),
      lineNumbers: 'on',
      minimap: { enabled: false },
      wordWrap: 'wordWrapColumn',
      wordWrapColumn: 80,
      wrappingIndent: 'same',
      renderWhitespace: 'selection',
      renderLineHighlight: 'line',
      renderLineHighlightOnlyWhenFocus: true,
      scrollBeyondLastLine: false,
      ...EDITOR_OVERFLOW_OPTIONS,
      smoothScrolling: true,
      padding: { top: 24, bottom: 40 },
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      accessibilitySupport: 'auto',
      contextmenu: false,
      unicodeHighlight: EDITOR_UNICODE_HIGHLIGHT_OPTIONS,
    });
    const controller = createController(editor, model, root);
    monacoRef.current = editor;
    modelRef.current = model;
    controllerRef.current = controller;
    setEditorView(controller);

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const selection = controller.getSelection();
      setContextMenu({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 250)),
        hasSelection: !selection.empty,
        canUndo: model.canUndo(),
        canRedo: model.canRedo(),
      });
    };
    const closeContextMenu = () => setContextMenu(null);
    root.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('mousedown', closeContextMenu);
    window.addEventListener('blur', closeContextMenu);

    let currentWrapColumn = 0;
    let viewportSignature = '';
    let fitFrame: number | null = null;

    const fitRenderedText = () => {
      fitFrame = null;
      const scrollbar = root.querySelector<HTMLElement>('.monaco-scrollable-element > .scrollbar.vertical');
      const renderedRuns = root.querySelectorAll<HTMLElement>('.view-lines .view-line span span');
      if (!scrollbar || renderedRuns.length === 0) return;

      const textLimit = scrollbar.getBoundingClientRect().left - 6;
      const maxTextRight = Math.max(...Array.from(renderedRuns, (run) => run.getBoundingClientRect().right));
      if (maxTextRight <= textLimit + 0.5) return;

      const fontInfo = editor.getOption(monaco.editor.EditorOption.fontInfo);
      const overflowColumns = Math.max(1, Math.ceil((maxTextRight - textLimit) / fontInfo.typicalHalfwidthCharacterWidth));
      const nextWrapColumn = Math.max(20, currentWrapColumn - overflowColumns);
      if (nextWrapColumn === currentWrapColumn) return;
      currentWrapColumn = nextWrapColumn;
      editor.updateOptions({ wordWrapColumn: nextWrapColumn });
      fitFrame = window.requestAnimationFrame(fitRenderedText);
    };

    const scheduleTextFit = () => {
      if (fitFrame !== null) window.cancelAnimationFrame(fitFrame);
      fitFrame = window.requestAnimationFrame(fitRenderedText);
    };

    const syncEditorViewport = (layout = editor.getLayoutInfo()) => {
      root.style.setProperty('--monaco-vertical-scrollbar-width', `${layout.verticalScrollbarWidth}px`);
      const fontInfo = editor.getOption(monaco.editor.EditorOption.fontInfo);
      const visibleTextWidth = Math.max(1, layout.contentWidth - layout.verticalScrollbarWidth - 8);
      root.style.setProperty('--monaco-visible-text-width', `${visibleTextWidth}px`);
      const signature = `${layout.contentWidth}:${layout.verticalScrollbarWidth}:${fontInfo.fontFamily}:${fontInfo.fontSize}:${fontInfo.typicalHalfwidthCharacterWidth}`;
      const nextWrapColumn = Math.max(20, Math.floor(visibleTextWidth / fontInfo.typicalHalfwidthCharacterWidth) - 1);
      if (signature !== viewportSignature) {
        viewportSignature = signature;
        currentWrapColumn = nextWrapColumn;
        editor.updateOptions({ wordWrapColumn: nextWrapColumn });
      }
      scheduleTextFit();
    };
    syncEditorViewport();
    const layoutDisposable = editor.onDidLayoutChange(syncEditorViewport);

    const clearCompanionTimer = () => {
      if (autoCompanionTimerRef.current !== null) window.clearTimeout(autoCompanionTimerRef.current);
      autoCompanionTimerRef.current = null;
    };

    const refreshSlashMenu = () => {
      const selection = controller.getSelection();
      if (!selection.empty) {
        slashMenuRef.current = null;
        setSlashMenu(null);
        return;
      }

      const position = offsetToPosition(model, selection.to);
      const line = toLine(model, position.lineNumber);
      const trigger = findSlashCommandTrigger(line.text, line.from, selection.to);
      const visible = editor.getScrolledVisiblePosition(position);
      const editorNode = editor.getDomNode();
      if (!trigger || !visible || !editorNode) {
        slashMenuRef.current = null;
        setSlashMenu(null);
        return;
      }

      const editorRect = editorNode.getBoundingClientRect();
      const nextMenu: SlashMenuState = {
        ...trigger,
        anchor: {
          left: editorRect.left + visible.left,
          top: editorRect.top + visible.top,
          bottom: editorRect.top + visible.top + visible.height,
        },
      };
      if (slashMenuRef.current?.query !== nextMenu.query) {
        slashSelectedIndexRef.current = 0;
        setSlashSelectedIndex(0);
      }
      slashMenuRef.current = nextMenu;
      setSlashMenu(nextMenu);
    };

    const scheduleCompanion = () => {
      const currentSettings = useAppStore.getState().settings;
      const selection = controller.getSelection();
      if (!currentSettings.ai.enabled || !currentSettings.ai.auto_suggest || !selection.empty) {
        clearCompanionTimer();
        return;
      }
      const before = controller.getText(Math.max(0, selection.to - AUTO_COMPANION_CONTEXT_LIMIT), selection.to).trim();
      if (before.length < MIN_AUTO_COMPANION_CHARS) return;
      clearCompanionTimer();
      autoCompanionTimerRef.current = window.setTimeout(() => {
        const latest = controller.getSelection();
        const prompt = controller.getText(Math.max(0, latest.to - AUTO_COMPANION_CONTEXT_LIMIT), latest.to).trim();
        const now = Date.now();
        if (!latest.empty || prompt.length < MIN_AUTO_COMPANION_CHARS || prompt === autoCompanionLastPromptRef.current || now - autoCompanionLastRequestAtRef.current < AUTO_COMPANION_MIN_INTERVAL) return;
        autoCompanionLastPromptRef.current = prompt;
        autoCompanionLastRequestAtRef.current = now;
        useAIStore.getState().setCompanionVisible(true, controller.coordsAtPos(latest.to) || undefined);
        useAIStore.getState().getCompanionSuggestion(prompt);
      }, Math.max(500, currentSettings.ai.suggest_delay || 2000));
    };

    const contentDisposable = editor.onDidChangeModelContent(() => {
      setContent(model.getValue());
      scheduleCompanion();
      scheduleTextFit();
      refreshSlashMenu();
    });
    const cursorDisposable = editor.onDidChangeCursorSelection(() => {
      scheduleCompanion();
      refreshSlashMenu();
    });
    const scrollDisposable = editor.onDidScrollChange(() => {
      scheduleTextFit();
      refreshSlashMenu();
    });
    const slashKeyDisposable = editor.onKeyDown((event) => {
      const menu = slashMenuRef.current;
      if (!menu) return;

      const commands = filterSlashCommands(menu.query);
      const key = event.browserEvent.key;
      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        slashMenuRef.current = null;
        setSlashMenu(null);
        return;
      }
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        if (commands.length === 0) return;
        const direction = key === 'ArrowDown' ? 1 : -1;
        const next = (slashSelectedIndexRef.current + direction + commands.length) % commands.length;
        slashSelectedIndexRef.current = next;
        setSlashSelectedIndex(next);
        return;
      }
      if ((key === 'Enter' || key === 'Tab') && commands.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const command = commands[Math.min(slashSelectedIndexRef.current, commands.length - 1)];
        const { text, selectionStart = text.length, selectionEnd = selectionStart } = command.insertion;
        slashMenuRef.current = null;
        setSlashMenu(null);
        controller.replaceRange(menu.from, menu.to, text, {
          from: menu.from + selectionStart,
          to: menu.from + selectionEnd,
        });
        controller.focus();
      }
    });

    const handleTheme = (event: Event) => {
      const theme = (event as CustomEvent<string>).detail;
      monaco.editor.setTheme(theme.endsWith('-dark') ? 'vs-dark' : 'vs');
    };
    window.addEventListener('markitdown-theme-change', handleTheme);

    const handlePaste = async (event: ClipboardEvent) => {
      const image = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'))?.getAsFile();
      if (!image) return;
      event.preventDefault();

      const store = useAppStore.getState();
      if (!imageHostConfigured(store.settings)) {
        store.setUploadStatus('error', 0, '请先启用并配置图床服务');
        store.setSettingsTab('image');
        store.setSettingsOpen(true);
        return;
      }

      const selection = controller.getSelection();
      store.setUploadStatus('uploading', 15, '正在上传剪贴板图片…');
      try {
        const dataUrl = await fileAsDataUrl(image);
        let url = dataUrl;
        if (isTauriRuntime()) {
          const extension = image.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
          url = await invoke<string>('upload_image_bytes', {
            dataBase64: dataUrl.split(',')[1],
            extension,
            service: store.settings.image_hosting.active_service,
            settings: store.settings,
          });
        }
        const markdown = `![粘贴的图片](${url})`;
        controller.replaceRange(selection.from, selection.to, markdown, { from: selection.from + markdown.length, to: selection.from + markdown.length });
        controller.focus();
        store.setUploadStatus('success', 100, isTauriRuntime() ? '图片已上传并插入' : '图片已嵌入文档');
      } catch (error) {
        store.setUploadStatus('error', 0, String(error));
      }
    };
    root.addEventListener('paste', handlePaste, true);

    return () => {
      clearCompanionTimer();
      if (fitFrame !== null) window.cancelAnimationFrame(fitFrame);
      root.removeEventListener('paste', handlePaste, true);
      root.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('mousedown', closeContextMenu);
      window.removeEventListener('blur', closeContextMenu);
      window.removeEventListener('markitdown-theme-change', handleTheme);
      contentDisposable.dispose();
      cursorDisposable.dispose();
      scrollDisposable.dispose();
      slashKeyDisposable.dispose();
      layoutDisposable.dispose();
      editor.dispose();
      model.dispose();
      monacoRef.current = null;
      modelRef.current = null;
      controllerRef.current = null;
      slashMenuRef.current = null;
      setEditorView(null);
    };
  }, [setContent, setEditorView]);

  useEffect(() => {
    const model = modelRef.current;
    const editor = monacoRef.current;
    if (!model || !editor || model.getValue() === content) return;
    editor.executeEdits('external-update', [{ range: model.getFullModelRange(), text: content, forceMoveMarkers: true }]);
  }, [content]);

  useEffect(() => {
    monacoRef.current?.updateOptions({
      fontSize: settings.appearance.font_size,
      lineHeight: Math.round(settings.appearance.font_size * settings.appearance.line_height),
      fontFamily: settings.appearance.font_family,
    });
  }, [settings.appearance.font_family, settings.appearance.font_size, settings.appearance.line_height]);

  useEffect(() => {
    const editor = monacoRef.current;
    const model = modelRef.current;
    if (!editor || !model) return;
    const decorations: monaco.editor.IModelDeltaDecoration[] = proofreadResults
      .filter((result: ProofreadResult) => result.from >= 0 && result.to > result.from && result.to <= model.getValueLength())
      .map((result: ProofreadResult) => ({
        range: monaco.Range.fromPositions(offsetToPosition(model, result.from), offsetToPosition(model, result.to)),
        options: { inlineClassName: 'monaco-proofread-error', hoverMessage: { value: result.explanation || result.suggestion } },
      }));
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [proofreadResults]);

  return (
    <div className={`editor-container monaco-editor-container ${className || ''}`} style={style}>
      <div className="editor-document-card monaco-document-card">
        <div ref={editorRef} className="editor-content monaco-host" />
      </div>
      {slashMenu && (
        <SlashCommandMenu
          anchor={slashMenu.anchor}
          commands={slashCommands}
          selectedIndex={Math.min(slashSelectedIndex, Math.max(0, slashCommands.length - 1))}
          query={slashMenu.query}
          onSelect={applySlashCommand}
          onSelectedIndexChange={selectSlashIndex}
          onClose={closeSlashMenu}
        />
      )}
      {contextMenu && (
        <div
          className="editor-context-menu"
          role="menu"
          aria-label={t('编辑器', language)}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" disabled={!contextMenu.canUndo} onClick={() => void runContextMenuAction('undo')}>
            <span>{t('撤销', language)}</span><kbd>Ctrl+Z</kbd>
          </button>
          <button type="button" role="menuitem" disabled={!contextMenu.canRedo} onClick={() => void runContextMenuAction('redo')}>
            <span>{t('重做', language)}</span><kbd>Ctrl+Y</kbd>
          </button>
          <div className="editor-context-menu-divider" role="separator" />
          <button type="button" role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void runContextMenuAction('cut')}>
            <span>{t('剪切', language)}</span><kbd>Ctrl+X</kbd>
          </button>
          <button type="button" role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void runContextMenuAction('copy')}>
            <span>{t('复制', language)}</span><kbd>Ctrl+C</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => void runContextMenuAction('paste')}>
            <span>{t('粘贴', language)}</span><kbd>Ctrl+V</kbd>
          </button>
          <div className="editor-context-menu-divider" role="separator" />
          <button type="button" role="menuitem" onClick={() => void runContextMenuAction('selectAll')}>
            <span>{t('全选', language)}</span><kbd>Ctrl+A</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
