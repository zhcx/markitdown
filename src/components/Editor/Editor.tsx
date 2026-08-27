import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import MarkdownIt from 'markdown-it';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, type Settings } from '../../stores/appStore';
import { useAIStore, type ProofreadResult } from '../../stores/aiStore';
import type { EditorController, EditorDispatchSpec, EditorLine } from '../../types/editor';
import { EDITOR_INPUT_OPTIONS, EDITOR_OVERFLOW_OPTIONS, EDITOR_UNICODE_HIGHLIGHT_OPTIONS } from '../../utils/editorLayout';
import { filterSlashCommands, findSlashCommandTrigger, type SlashCommand, type SlashCommandAiAction } from '../../utils/slashCommands';
import { SlashCommandMenu, type SlashMenuAnchor } from './SlashCommandMenu';
import { getMonacoApi, loadMonaco, type MonacoModule } from './monacoLoader';
import { ImageOptionsModal, Toolbar } from '../Toolbar/Toolbar';
import { normalizeLanguage, t } from '../../i18n';
import { sanitizeRenderedHtml } from '../../utils/safeHtml';

interface EditorProps {
  className?: string;
  style?: React.CSSProperties;
  onActiveLineChange?: (lineNumber: number) => void;
  onActiveLineReveal?: (lineNumber: number) => void;
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
  submenuDirection: 'left' | 'right';
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const contextMenuMarkdown = new MarkdownIt({ html: true, breaks: true, linkify: true, typographer: true });

interface SelectionToolbarState {
  left: number;
  top: number;
  width: number;
  placement: 'above' | 'below';
}

/** 「/ 问答」「/ 写作」的补充说明输入弹层状态。 */
interface SlashAiPromptState {
  action: SlashCommandAiAction;
  insertAt: number;
  left: number;
  top: number;
}

type ContextMenuIconName = 'sparkles' | 'translate' | 'copy' | 'copyAs' | 'paste' | 'text' | 'pdf' | 'document' | 'code' | 'image' | 'folder' | 'undo' | 'redo' | 'select';

function ContextMenuIcon({ name }: { name: ContextMenuIconName }) {
  if (name === 'sparkles') return <svg viewBox="0 0 18 18"><path d="m6.2 2 .7 2.1L9 5l-2.1.8-.7 2.1-.8-2.1L3.3 5l2.1-.9zM12.3 7.2l.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z" /></svg>;
  if (name === 'translate') return <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="6.5" /><path d="M2.5 9h13M9 2.5c1.7 1.8 2.6 4 2.6 6.5S10.7 13.7 9 15.5C7.3 13.7 6.4 11.5 6.4 9S7.3 4.3 9 2.5Z" /></svg>;
  if (name === 'copy') return <svg viewBox="0 0 18 18"><rect x="5.2" y="3.2" width="9" height="11.5" rx="1.5" /><path d="M3.4 12V5.3c0-1 .8-1.8 1.8-1.8" /></svg>;
  if (name === 'copyAs') return <svg viewBox="0 0 18 18"><rect x="5.2" y="4" width="8.8" height="11" rx="1.4" /><path d="M3.2 12V4.8C3.2 3.8 4 3 5 3M15.5 7.2l1.8 1.8-1.8 1.8" /></svg>;
  if (name === 'paste') return <svg viewBox="0 0 18 18"><path d="M6.2 3.7h-2v11h8.6v-2.1" /><rect x="6.2" y="2.5" width="6.5" height="9" rx="1.3" /><path d="M8 2.5V1.4h3v1.1" /></svg>;
  if (name === 'text') return <svg viewBox="0 0 18 18"><path d="M2.4 6.2h5.2M5 6.2v6M10 6.2h5.6M12.8 6.2v6M10.6 12h4.4" /></svg>;
  if (name === 'pdf') return <svg viewBox="0 0 18 18"><path d="M4 1.8h6l3.5 3.5v10.9H4zM10 1.8v3.5h3.5" /><path d="M5.5 12.8h1.2c1.4 0 1.4-2.3 0-2.3H5.5v4M8.7 14.5v-4h1c1.7 0 1.7 4 0 4zM12 14.5v-4h2" /></svg>;
  if (name === 'document') return <svg viewBox="0 0 18 18"><path d="M4 1.8h6l3.5 3.5v10.9H4zM10 1.8v3.5h3.5M6.2 8.3h5.2M6.2 11h5.2M6.2 13.7h3.5" /></svg>;
  if (name === 'code') return <svg viewBox="0 0 18 18"><path d="m6.4 4-4 5 4 5M11.6 4l4 5-4 5M10.2 2.8 7.8 15.2" /></svg>;
  if (name === 'image') return <svg viewBox="0 0 18 18"><rect x="2.4" y="2.8" width="13.2" height="12.4" rx="1.4" /><circle cx="6.2" cy="6.7" r="1.2" /><path d="m3.5 13.5 3.6-3.8 2.5 2.4 2.1-2.2 2.8 3.1" /></svg>;
  if (name === 'folder') return <svg viewBox="0 0 18 18"><path d="M2 5.2h5l1.3 1.5H16v7.8H2zM2 5.2V3.5h5l1.3 1.7" /></svg>;
  if (name === 'undo') return <svg viewBox="0 0 18 18"><path d="M6.5 5 3 8.5 6.5 12M3.4 8.5h6.2c3 0 4.8 1.6 4.8 4.3" /></svg>;
  if (name === 'redo') return <svg viewBox="0 0 18 18"><path d="m11.5 5 3.5 3.5-3.5 3.5M14.6 8.5H8.4c-3 0-4.8 1.6-4.8 4.3" /></svg>;
  return <svg viewBox="0 0 18 18"><path d="M3 4h12M3 9h12M3 14h12" /></svg>;
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

function createController(monacoApi: MonacoModule, editor: monaco.editor.IStandaloneCodeEditor, model: monaco.editor.ITextModel, root: HTMLElement): EditorController {
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
    editor.setSelection(new monacoApi.Selection(start.lineNumber, start.column, end.lineNumber, end.column));
  };

  const applyDispatch = (spec: EditorDispatchSpec) => {
    const change = spec?.changes;
    if (change && typeof change.from === 'number') {
      const text = change.insert ?? '';
      editor.executeEdits('zeditor', [{ range: monacoApi.Range.fromPositions(offsetToPosition(model, change.from), offsetToPosition(model, change.to ?? change.from)), text, forceMoveMarkers: true }]);
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
    setScrollTop: (top: number) => editor.setScrollTop(top, monacoApi.editor.ScrollType.Immediate),
    onScroll: (listener: () => void) => {
      const disposable = editor.onDidScrollChange((event) => {
        if (event.scrollTopChanged || event.scrollHeightChanged) listener();
      });
      return () => disposable.dispose();
    },
    getValue: () => model.getValue(),
    getSelection,
    getText: (from, to) => model.getValueInRange(monacoApi.Range.fromPositions(offsetToPosition(model, from), offsetToPosition(model, to))),
    replaceRange: (from, to, text, selection) => {
      editor.executeEdits('zeditor', [{ range: monacoApi.Range.fromPositions(offsetToPosition(model, from), offsetToPosition(model, to)), text, forceMoveMarkers: true }]);
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
    undo: () => editor.trigger('zeditor', 'undo', null),
    redo: () => editor.trigger('zeditor', 'redo', null),
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

// 执行「/ 菜单」里的动作型 AI 命令。trigger 文本已由调用方移除，
// insertAt 即原斜杠位置；AI 未启用时各 store 动作自身会安全返回。
// 问答/写作需要调用方先通过输入弹层补充 instruction。
async function runSlashAiAction(
  action: SlashCommandAiAction,
  controller: EditorController,
  insertAt: number,
  instruction?: string,
) {
  const aiStore = useAIStore.getState();
  const selection = controller.getSelection();
  const inserted = (text: string) => {
    if (!text) return;
    controller.replaceRange(insertAt, insertAt, text, {
      from: insertAt + text.length,
      to: insertAt + text.length,
    });
  };
  // 无选区时的默认来源：光标前一小段文字，控制请求体积。
  const contextualSource = () => {
    const from = Math.max(0, selection.to - AUTO_COMPANION_CONTEXT_LIMIT * 3);
    return controller.getText(from, selection.to);
  };
  const actionSource = () =>
    selection.empty ? contextualSource() : controller.getText(selection.from, selection.to);

  switch (action) {
    case 'continue': {
      const before = contextualSource();
      if (!before.trim()) return;
      const continuation = await aiStore.continueWriting(before);
      inserted(continuation ? `\n\n${continuation}` : '');
      break;
    }
    case 'polish': {
      // 润色的对象必须是明确的选区，避免静默改写整篇文档。
      if (selection.empty) {
        aiStore.setStatus('error', '请先选中要润色的内容');
        return;
      }
      const source = controller.getText(selection.from, selection.to);
      const polished = await aiStore.rewriteSelection(source);
      if (polished && polished !== source) {
        controller.replaceRange(selection.from, selection.to, polished, {
          from: selection.from,
          to: selection.from + polished.length,
        });
      }
      break;
    }
    case 'translate': {
      const source = actionSource();
      if (!source.trim()) return;
      const result = await aiStore.translateText(source);
      const separatorIndex = result.indexOf('|||');
      if (separatorIndex < 0) return;
      const translated = result.slice(separatorIndex + 3).trim();
      inserted(translated ? `\n\n> ${source.trim()}\n\n**译文**：${translated}` : '');
      break;
    }
    case 'summarize': {
      const source = actionSource();
      if (!source.trim()) return;
      const summary = await aiStore.summarizeText(source);
      inserted(summary ? `\n\n## 要点总结\n\n${summary.trim()}` : '');
      break;
    }
    case 'ask': {
      const question = instruction?.trim();
      if (!question) return;
      const answer = await aiStore.chatForEditor(question, actionSource());
      inserted(answer ? `\n\n**问**：${question}\n\n**答**：${answer}` : '');
      break;
    }
    case 'write': {
      const requirement = instruction?.trim();
      if (!requirement) return;
      const drafted = await aiStore.chatForEditor(
        `请以 Markdown 格式完成以下写作要求，直接输出正文，不要解释：\n${requirement}`,
        actionSource(),
      );
      inserted(drafted ? `\n\n${drafted}` : '');
      break;
    }
  }
  controller.focus();
}

export function Editor({ className, style, onActiveLineChange, onActiveLineReveal }: EditorProps) {
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
  const [slashAiPrompt, setSlashAiPrompt] = useState<SlashAiPromptState | null>(null);
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  const [copyAsOpen, setCopyAsOpen] = useState(false);
  const [showContextImageModal, setShowContextImageModal] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
  const [monacoReady, setMonacoReady] = useState(false);
  const { content, currentFile, setContent, settings, setEditorView } = useAppStore();
  const { proofreadResults, rewriteSelection, translateText, setTranslationVisible, setStatus } = useAIStore();
  const initialContentRef = useRef(content);
  const slashCommands = useMemo(() => filterSlashCommands(slashMenu?.query || ''), [slashMenu?.query]);
  const language = normalizeLanguage(settings.appearance.language);

  useEffect(() => {
    const handleFindRequest = (event: Event) => {
      const replace = Boolean((event as CustomEvent<{ replace?: boolean }>).detail?.replace);
      slashMenuRef.current = null;
      setSlashMenu(null);
      monacoRef.current?.trigger(
        'zeditor-editor-find',
        replace ? 'editor.action.startFindReplaceAction' : 'actions.find',
        null,
      );
    };
    window.addEventListener('zeditor-editor-find', handleFindRequest);
    return () => window.removeEventListener('zeditor-editor-find', handleFindRequest);
  }, []);

  const runContextMenuAction = useCallback(async (action: 'undo' | 'redo' | 'cut' | 'copy' | 'copyHtml' | 'copyPlain' | 'paste' | 'selectAll') => {
    const editor = monacoRef.current;
    const model = modelRef.current;
    const controller = controllerRef.current;
    setContextMenu(null);
    if (!editor || !model || !controller) return;

    if (action === 'undo' || action === 'redo') {
      editor.trigger('zeditor-context-menu', action, null);
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
      editor.trigger('zeditor-context-menu', 'editor.action.clipboardPasteAction', null);
      }
    } else {
      const selection = controller.getSelection();
      const selectedText = controller.getText(selection.from, selection.to);
      if (!selectedText) return;
      const clipboardText = action === 'copyPlain'
        ? selectedText
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/(?:\*\*|__|~~|`)/g, '')
        : action === 'copyHtml'
          ? sanitizeRenderedHtml(contextMenuMarkdown.render(selectedText))
        : selectedText;
      try {
        if (action === 'copyHtml' && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
          await navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([clipboardText], { type: 'text/html' }),
            'text/plain': new Blob([clipboardText], { type: 'text/plain' }),
          })]);
        } else {
          await navigator.clipboard.writeText(clipboardText);
        }
        if (action === 'cut') controller.replaceRange(selection.from, selection.to, '');
      } catch {
        if (action === 'copyHtml') {
          try {
            await navigator.clipboard.writeText(clipboardText);
          } catch {
            // Clipboard permissions can be denied by the host WebView.
          }
        } else {
      editor.trigger('zeditor-context-menu', `editor.action.clipboard${action === 'cut' ? 'Cut' : 'Copy'}Action`, null);
        }
      }
    }
    editor.focus();
  }, []);

  const polishContextSelection = useCallback(async () => {
    const controller = controllerRef.current;
    setContextMenu(null);
    if (!controller) return;
    const selection = controller.getSelection();
    const selectedText = controller.getText(selection.from, selection.to);
    if (!selectedText) return;
    setStatus('loading', '正在润色选中文本...');
    const polished = await rewriteSelection(selectedText);
    if (polished) controller.replaceRange(selection.from, selection.to, polished, { from: selection.from, to: selection.from + polished.length });
    controller.focus();
  }, [rewriteSelection, setStatus]);

  const translateContextSelection = useCallback(async () => {
    const controller = controllerRef.current;
    setContextMenu(null);
    if (!controller) return;
    const selection = controller.getSelection();
    const selectedText = controller.getText(selection.from, selection.to);
    if (!selectedText) return;
    const coords = controller.coordsAtPos(selection.from);
    const result = await translateText(selectedText);
    const separatorIndex = result.indexOf('|||');
    if (separatorIndex < 0) return;
    const original = result.slice(0, separatorIndex);
    const translated = result.slice(separatorIndex + 3);
    if (translated && translated !== selectedText) {
      setTranslationVisible(true, coords ? { x: coords.left, y: coords.bottom } : undefined, original, translated);
    }
    controller.focus();
  }, [setTranslationVisible, translateText]);

  const insertContextImage = useCallback((url: string, alt = '图片') => {
    const controller = controllerRef.current;
    if (!controller) return;
    const selection = controller.getSelection();
    const markdown = `![${alt}](${url})`;
    controller.replaceRange(selection.from, selection.to, markdown, { from: selection.from + markdown.length, to: selection.from + markdown.length });
    controller.focus();
    setShowContextImageModal(false);
  }, []);

  const requestExport = useCallback((format: 'pdf' | 'word' | 'html') => {
    setContextMenu(null);
    window.dispatchEvent(new CustomEvent('zeditor-export-request', { detail: { format } }));
  }, []);

  const revealCurrentFile = useCallback(async () => {
    setContextMenu(null);
    if (!currentFile || currentFile.startsWith('web://')) return;
    await invoke('reveal_in_file_manager', { path: currentFile });
  }, [currentFile]);

  const closeSlashMenu = useCallback(() => {
    slashMenuRef.current = null;
    setSlashMenu(null);
  }, []);

  const selectSlashIndex = useCallback((index: number) => {
    slashSelectedIndexRef.current = index;
    setSlashSelectedIndex(index);
  }, []);

  // 动作型命令的统一入口：移除 /触发词后，普通动作立即执行，
  // 问答/写作先弹出补充说明输入框（锚定在原光标位置）。
  const launchSlashAiCommand = useCallback((command: SlashCommand, menu: { from: number; to: number }) => {
    const controller = controllerRef.current;
    if (!controller || !command.ai) return;
    controller.replaceRange(menu.from, menu.to, '', { from: menu.from, to: menu.from });

    if (command.needsPrompt) {
      const coords = controller.coordsAtPos(menu.from);
      setSlashAiPrompt({
        action: command.ai,
        insertAt: menu.from,
        left: Math.max(12, Math.min(coords?.left ?? 200, window.innerWidth - 400)),
        top: Math.min((coords?.bottom ?? 240) + 8, window.innerHeight - 160),
      });
      return;
    }
    void runSlashAiAction(command.ai, controller, menu.from);
  }, []);

  const applySlashCommand = useCallback((command: SlashCommand) => {
    const menu = slashMenuRef.current;
    const controller = controllerRef.current;
    if (!menu || !controller) return;

    slashMenuRef.current = null;
    setSlashMenu(null);

    if (command.ai) {
      launchSlashAiCommand(command, menu);
      return;
    }

    const { text, selectionStart = text.length, selectionEnd = selectionStart } = command.insertion;
    controller.replaceRange(menu.from, menu.to, text, {
      from: menu.from + selectionStart,
      to: menu.from + selectionEnd,
    });
    controller.focus();
  }, [launchSlashAiCommand]);

  // Monaco 内核按需加载：应用外壳先完成首帧渲染，内核就绪后再初始化编辑器，
  // 避免启动关键路径被 ~3.5 MB 的编辑器代码阻塞。
  useEffect(() => {
    let cancelled = false;
    void loadMonaco().then(() => {
      if (!cancelled) setMonacoReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const root = editorRef.current;
    if (!monacoReady || !root || monacoRef.current) return;
    const monacoApi = getMonacoApi();

    const isDark = (document.documentElement.dataset.theme || '').endsWith('-dark');
    const model = monacoApi.editor.createModel(initialContentRef.current, 'markdown');
    const editor = monacoApi.editor.create(root, {
      model,
      theme: isDark ? 'vs-dark' : 'vs',
      automaticLayout: true,
      fontFamily: 'var(--font-content)',
      fontSize: useAppStore.getState().settings.appearance.font_size,
      lineHeight: Math.round(useAppStore.getState().settings.appearance.font_size * useAppStore.getState().settings.appearance.line_height),
      lineNumbers: 'on',
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      wordWrap: 'on',
      wrappingIndent: 'same',
      renderWhitespace: 'selection',
      renderLineHighlight: 'line',
      renderLineHighlightOnlyWhenFocus: false,
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false },
      ...EDITOR_OVERFLOW_OPTIONS,
      ...EDITOR_INPUT_OPTIONS,
      // 关闭平滑滚动：开启时 Monaco 会把输入过程中的光标自动定位
      // （光标到底/换行后的 reveal）做成多帧滚动动画，正在输入的那一行
      // 会随动画“上跳一行”，干扰连续输入。分栏同步走 ScrollType.Immediate
      // 不受影响，此处为即时滚动以保证输入稳定。
      smoothScrolling: false,
      padding: { top: 24, bottom: 40 },
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      // 显式关闭无障碍支持：Monaco 会把光标所在行镜像到隐藏辅助容器，
      // 该容器一旦定位偏差就会出现“整行文字浮现在顶部”的视觉错乱；
      // 关闭后镜像始终为空，且省去每次按键的无障碍同步开销。
      accessibilitySupport: 'off',
      contextmenu: false,
      // 关闭光标平滑移动动画：该动画会让输入时文字在光标前进方向上出现
      // 拖影/瞬移到文档顶部空白处的渲染错位（文字“跳第一行”）；
      // 光标闪烁保持平滑便于定位，移动本身改为瞬移保证所见即所输。
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'off',
      unicodeHighlight: EDITOR_UNICODE_HIGHLIGHT_OPTIONS,
    });
    const controller = createController(monacoApi, editor, model, root);
    monacoRef.current = editor;
    modelRef.current = model;
    controllerRef.current = controller;
    setEditorView(controller);
    onActiveLineChange?.(editor.getPosition()?.lineNumber || 1);

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setCopyAsOpen(false);
      const selection = controller.getSelection();
      const menuWidth = 336;
      const submenuWidth = 150;
      const menuHeight = 660;
      const x = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
      setContextMenu({
        x,
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
        submenuDirection: x + menuWidth + submenuWidth + 4 <= window.innerWidth ? 'right' : 'left',
        hasSelection: !selection.empty,
        canUndo: model.canUndo(),
        canRedo: model.canRedo(),
      });
    };
    const closeContextMenu = () => setContextMenu(null);
    root.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('mousedown', closeContextMenu);
    window.addEventListener('blur', closeContextMenu);

    const syncEditorViewport = (layout = editor.getLayoutInfo()) => {
      root.style.setProperty('--monaco-vertical-scrollbar-width', `${layout.verticalScrollbarWidth}px`);
      const visibleTextWidth = Math.max(1, layout.contentWidth - layout.verticalScrollbarWidth - 8);
      root.style.setProperty('--monaco-visible-text-width', `${visibleTextWidth}px`);
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

    let selectionPointerActive = false;
    const refreshSelectionToolbar = () => {
      if (selectionPointerActive) {
        setSelectionToolbar(null);
        return;
      }
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) {
        setSelectionToolbar(null);
        return;
      }
      const visible = editor.getScrolledVisiblePosition(selection.getStartPosition());
      const editorNode = editor.getDomNode();
      if (!visible || !editorNode) {
        setSelectionToolbar(null);
        return;
      }
      const rect = editorNode.getBoundingClientRect();
      const width = Math.min(720, Math.max(220, rect.width - 16), window.innerWidth - 16);
      const desiredLeft = rect.left + visible.left - width * 0.28;
      const left = Math.max(rect.left + 8, Math.min(desiredLeft, rect.right - width - 8));
      const toolbarHeight = 44;
      const placeAbove = rect.top + visible.top >= toolbarHeight + 12;
      setSelectionToolbar({
        left,
        top: placeAbove ? rect.top + visible.top - 8 : rect.top + visible.top + visible.height + 8,
        width,
        placement: placeAbove ? 'above' : 'below',
      });
    };
    const editorNode = editor.getDomNode();
    const handleSelectionPointerDown = () => {
      selectionPointerActive = true;
      setSelectionToolbar(null);
    };
    const handleSelectionPointerEnd = () => {
      if (!selectionPointerActive) return;
      selectionPointerActive = false;
      window.requestAnimationFrame(refreshSelectionToolbar);
    };
    editorNode?.addEventListener('pointerdown', handleSelectionPointerDown, true);
    window.addEventListener('pointerup', handleSelectionPointerEnd, true);
    window.addEventListener('pointercancel', handleSelectionPointerEnd, true);
    const selectionToolbarResizeObserver = new ResizeObserver(refreshSelectionToolbar);
    selectionToolbarResizeObserver.observe(root);

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
      refreshSlashMenu();
    });
    const cursorDisposable = editor.onDidChangeCursorSelection(() => {
      onActiveLineChange?.(editor.getPosition()?.lineNumber || 1);
      scheduleCompanion();
      refreshSlashMenu();
      refreshSelectionToolbar();
    });
    const mouseDisposable = editor.onMouseUp((event) => {
      const lineNumber = event.target.position?.lineNumber;
      if (lineNumber) onActiveLineReveal?.(lineNumber);
    });
    const scrollDisposable = editor.onDidScrollChange(() => {
      refreshSlashMenu();
      refreshSelectionToolbar();
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
        slashMenuRef.current = null;
        setSlashMenu(null);
        if (command.ai) {
          launchSlashAiCommand(command, menu);
        } else {
          const { text, selectionStart = text.length, selectionEnd = selectionStart } = command.insertion;
          controller.replaceRange(menu.from, menu.to, text, {
            from: menu.from + selectionStart,
            to: menu.from + selectionEnd,
          });
        }
        controller.focus();
      }
    });

    const handleTheme = (event: Event) => {
      const theme = (event as CustomEvent<string>).detail;
      monacoApi.editor.setTheme(theme.endsWith('-dark') ? 'vs-dark' : 'vs');
    };
    window.addEventListener('zeditor-theme-change', handleTheme);

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
      root.removeEventListener('paste', handlePaste, true);
      root.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('mousedown', closeContextMenu);
      window.removeEventListener('blur', closeContextMenu);
      editorNode?.removeEventListener('pointerdown', handleSelectionPointerDown, true);
      window.removeEventListener('pointerup', handleSelectionPointerEnd, true);
      window.removeEventListener('pointercancel', handleSelectionPointerEnd, true);
    window.removeEventListener('zeditor-theme-change', handleTheme);
      contentDisposable.dispose();
      cursorDisposable.dispose();
      mouseDisposable.dispose();
      scrollDisposable.dispose();
      slashKeyDisposable.dispose();
      layoutDisposable.dispose();
      selectionToolbarResizeObserver.disconnect();
      editor.dispose();
      model.dispose();
      monacoRef.current = null;
      modelRef.current = null;
      controllerRef.current = null;
      slashMenuRef.current = null;
      setEditorView(null);
    };
  }, [launchSlashAiCommand, monacoReady, onActiveLineChange, onActiveLineReveal, setContent, setEditorView]);

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
    const handleFontSizePreview = (event: Event) => {
      const fontSize = Number((event as CustomEvent<number>).detail);
      if (!Number.isFinite(fontSize) || fontSize <= 0) return;
      monacoRef.current?.updateOptions({
        fontSize,
        lineHeight: Math.round(fontSize * settings.appearance.line_height),
      });
    };
    window.addEventListener('zeditor-content-font-size-preview', handleFontSizePreview);
    return () => window.removeEventListener('zeditor-content-font-size-preview', handleFontSizePreview);
  }, [settings.appearance.line_height]);

  useEffect(() => {
    const editor = monacoRef.current;
    const model = modelRef.current;
    if (!editor || !model) return;
    const monacoApi = getMonacoApi();
    const decorations: monaco.editor.IModelDeltaDecoration[] = proofreadResults
      .filter((result: ProofreadResult) => result.from >= 0 && result.to > result.from && result.to <= model.getValueLength())
      .map((result: ProofreadResult) => ({
        range: monacoApi.Range.fromPositions(offsetToPosition(model, result.from), offsetToPosition(model, result.to)),
        options: { inlineClassName: 'monaco-proofread-error', hoverMessage: { value: result.explanation || result.suggestion } },
      }));
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [proofreadResults]);

  return (
    <div className={`editor-container monaco-editor-container ${className || ''}`} style={style}>
      <div className="editor-document-card monaco-document-card">
        {!monacoReady && <div className="editor-loading-placeholder">正在加载编辑器…</div>}
        <div ref={editorRef} className="editor-content monaco-host" />
      </div>
      {selectionToolbar && !settings.editor.pin_toolbar && (
        <div
          className="selection-toolbar"
          data-placement={selectionToolbar.placement}
          style={{ left: selectionToolbar.left, top: selectionToolbar.top, width: selectionToolbar.width }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <Toolbar variant="floating" />
        </div>
      )}
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
      {slashAiPrompt && (
        <SlashAiPromptBox
          anchor={{ left: slashAiPrompt.left, top: slashAiPrompt.top }}
          isQuestion={slashAiPrompt.action === 'ask'}
          onCancel={() => setSlashAiPrompt(null)}
          onSubmit={(text) => {
            const spec = slashAiPrompt;
            const controller = controllerRef.current;
            setSlashAiPrompt(null);
            if (!spec || !controller || !text.trim()) {
              controller?.focus();
              return;
            }
            void runSlashAiAction(spec.action, controller, spec.insertAt, text);
          }}
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
          <button type="button" role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void polishContextSelection()}>
            <span className="editor-context-menu-icon tone-accent"><ContextMenuIcon name="sparkles" /></span><span className="editor-context-menu-label">AI 润色</span>
          </button>
          <button type="button" role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void translateContextSelection()}>
            <span className="editor-context-menu-icon tone-blue"><ContextMenuIcon name="translate" /></span><span className="editor-context-menu-label">AI 翻译</span>
          </button>
          <div className="editor-context-menu-divider" role="separator" />
          <button type="button" role="menuitem" disabled={!contextMenu.canUndo} onClick={() => void runContextMenuAction('undo')}>
            <span className="editor-context-menu-icon"><ContextMenuIcon name="undo" /></span><span className="editor-context-menu-label">{t('撤销', language)}</span><kbd>Ctrl+Z</kbd>
          </button>
          <button type="button" role="menuitem" disabled={!contextMenu.canRedo} onClick={() => void runContextMenuAction('redo')}>
            <span className="editor-context-menu-icon"><ContextMenuIcon name="redo" /></span><span className="editor-context-menu-label">{t('重做', language)}</span><kbd>Ctrl+Y</kbd>
          </button>
          <div className="editor-context-menu-divider" role="separator" />
          <button type="button" role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void runContextMenuAction('copy')}>
            <span className="editor-context-menu-icon tone-blue"><ContextMenuIcon name="copy" /></span><span className="editor-context-menu-label">{t('复制', language)}</span><kbd>Ctrl+C</kbd>
          </button>
          <div className="editor-context-copy-as" data-submenu-direction={contextMenu.submenuDirection} onMouseEnter={() => setCopyAsOpen(true)} onMouseLeave={() => setCopyAsOpen(false)}>
            <button type="button" role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => setCopyAsOpen((open) => !open)}>
              <span className="editor-context-menu-icon"><ContextMenuIcon name="copyAs" /></span><span className="editor-context-menu-label">复制为</span><span className="editor-context-menu-chevron">›</span>
            </button>
            {copyAsOpen && contextMenu.hasSelection && (
              <div className="editor-context-submenu" role="menu">
                <button type="button" role="menuitem" onClick={() => void runContextMenuAction('copyHtml')}><span>HTML</span></button>
                <button type="button" role="menuitem" onClick={() => void runContextMenuAction('copyPlain')}><span>纯文本</span></button>
              </div>
            )}
          </div>
          <button type="button" role="menuitem" onClick={() => void runContextMenuAction('paste')}>
            <span className="editor-context-menu-icon tone-green"><ContextMenuIcon name="paste" /></span><span className="editor-context-menu-label">{t('粘贴', language)}</span><kbd>Ctrl+V</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => void runContextMenuAction('paste')}>
            <span className="editor-context-menu-icon"><ContextMenuIcon name="text" /></span><span className="editor-context-menu-label">粘贴为纯文本</span><kbd>Ctrl+Shift+V</kbd>
          </button>
          <div className="editor-context-menu-divider" role="separator" />
          <button type="button" role="menuitem" onClick={() => requestExport('pdf')}>
            <span className="editor-context-menu-icon tone-red"><ContextMenuIcon name="pdf" /></span><span className="editor-context-menu-label">导出 PDF</span>
          </button>
          <button type="button" role="menuitem" onClick={() => requestExport('word')}>
            <span className="editor-context-menu-icon tone-blue"><ContextMenuIcon name="document" /></span><span className="editor-context-menu-label">导出 Word</span>
          </button>
          <button type="button" role="menuitem" onClick={() => requestExport('html')}>
            <span className="editor-context-menu-icon tone-blue"><ContextMenuIcon name="code" /></span><span className="editor-context-menu-label">导出 HTML</span>
          </button>
          <div className="editor-context-menu-divider" role="separator" />
          <button type="button" role="menuitem" onClick={() => { setContextMenu(null); setShowContextImageModal(true); }}>
            <span className="editor-context-menu-icon tone-gold"><ContextMenuIcon name="image" /></span><span className="editor-context-menu-label">插入图片</span>
          </button>
          <button type="button" role="menuitem" disabled={!currentFile || currentFile.startsWith('web://')} onClick={() => void revealCurrentFile()}>
            <span className="editor-context-menu-icon tone-blue"><ContextMenuIcon name="folder" /></span><span className="editor-context-menu-label">在文件夹中显示</span>
          </button>
        </div>
      )}
      {showContextImageModal && <ImageOptionsModal onClose={() => setShowContextImageModal(false)} onInsert={insertContextImage} />}
    </div>
  );
}

/** 「/ 问答」「/ 写作」的补充说明输入框，锚定在原 / 触发位置附近。 */
function SlashAiPromptBox({
  anchor,
  isQuestion,
  onSubmit,
  onCancel,
}: {
  anchor: { left: number; top: number };
  isQuestion: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.querySelector('textarea')?.focus();
  }, []);

  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value);
  };

  return (
    <div ref={boxRef} className="slash-ai-prompt" style={{ left: anchor.left, top: anchor.top }}>
      <textarea
        rows={3}
        value={value}
        placeholder={isQuestion
          ? '输入你的问题…（Enter 发送 · Shift+Enter 换行 · Esc 取消）'
          : '描述写作要求，如“写一段产品发布公告”…（Enter 发送 · Shift+Enter 换行 · Esc 取消）'}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // 拦截冒泡：Monaco 与全局快捷键不应响应弹层中的按键。
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="slash-ai-prompt-actions">
        <button type="button" onClick={onCancel}>取消</button>
        <button type="button" className="primary" disabled={!value.trim()} onClick={submit}>
          {isQuestion ? '提问' : '生成'}
        </button>
      </div>
    </div>
  );
}
