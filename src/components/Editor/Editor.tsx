import { useEffect, useRef } from 'react';
import { EditorState, Prec, Compartment, RangeSetBuilder } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, Decoration } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultKeymap, history, historyKeymap, insertNewline } from '@codemirror/commands';
import { useAppStore } from '../../stores/appStore';
import { useAIStore, ProofreadResult } from '../../stores/aiStore';

interface EditorProps {
  className?: string;
  style?: React.CSSProperties;
}

// 创建校对错误高亮装饰
const proofreadErrorMark = Decoration.mark({
  class: 'cm-proofread-error',
  attributes: { 'data-error': 'true' }
});

// 创建装饰函数 — 对所有范围做防御性校验，防止 CodeMirror panic
const createProofreadDecorations = (results: ProofreadResult[]) => {
  return EditorView.decorations.of((view) => {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    const docLen = doc.length;

    // 按 from 升序排列，确保 RangeSetBuilder 不会因乱序而崩溃
    const sorted = [...results]
      .filter(r => typeof r.from === 'number' && typeof r.to === 'number' && !isNaN(r.from) && !isNaN(r.to))
      .sort((a, b) => a.from - b.from);

    for (const result of sorted) {
      const from = result.from;
      const to = result.to;
      // 严格校验：from >= 0, to <= docLen, from < to（合法范围）
      if (from < 0 || from >= docLen || to <= 0 || to > docLen || from >= to) {
        continue;
      }
      try {
        builder.add(from, to, proofreadErrorMark);
      } catch {
        // 单个装饰失败不应导致整个面板崩溃
        continue;
      }
    }

    return builder.finish();
  });
};

const MIN_AUTO_COMPANION_CHARS = 6;
const AUTO_COMPANION_CONTEXT_LIMIT = 800;
const AUTO_COMPANION_MIN_INTERVAL = 1200;

export function Editor({ className, style }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const decorationsCompartmentRef = useRef(new Compartment());
  const autoCompanionTimerRef = useRef<number | null>(null);
  const autoCompanionLastPromptRef = useRef('');
  const autoCompanionLastRequestAtRef = useRef(0);
  const { content, setContent, settings, setEditorView } = useAppStore();
  const { proofreadResults } = useAIStore();
  const initialContentRef = useRef(content);
  const initialAppearanceRef = useRef(settings.appearance);

  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;
    const initialAppearance = initialAppearanceRef.current;

    const clearAutoCompanionTimer = () => {
      if (autoCompanionTimerRef.current !== null) {
        window.clearTimeout(autoCompanionTimerRef.current);
        autoCompanionTimerRef.current = null;
      }
    };

    const scheduleAutoCompanion = (view: EditorView) => {
      const { settings: currentSettings } = useAppStore.getState();

      if (!currentSettings.ai.enabled || !currentSettings.ai.auto_suggest) {
        clearAutoCompanionTimer();
        return;
      }

      const selection = view.state.selection.main;
      if (!selection.empty) {
        clearAutoCompanionTimer();
        return;
      }

      const cursor = selection.to;
      const textBefore = view.state.sliceDoc(Math.max(0, cursor - AUTO_COMPANION_CONTEXT_LIMIT), cursor);
      if (textBefore.trim().length < MIN_AUTO_COMPANION_CHARS) {
        clearAutoCompanionTimer();
        useAIStore.getState().setCompanionVisible(false);
        return;
      }

      clearAutoCompanionTimer();
      autoCompanionTimerRef.current = window.setTimeout(() => {
        const latestView = viewRef.current;
        const { settings: latestSettings } = useAppStore.getState();
        if (!latestView || !latestSettings.ai.enabled || !latestSettings.ai.auto_suggest) return;

        const latestSelection = latestView.state.selection.main;
        if (!latestSelection.empty) return;

        const latestCursor = latestSelection.to;
        const latestTextBefore = latestView.state.sliceDoc(Math.max(0, latestCursor - AUTO_COMPANION_CONTEXT_LIMIT), latestCursor);
        const latestPrompt = latestTextBefore.trim();
        if (latestPrompt.length < MIN_AUTO_COMPANION_CHARS) return;

        const now = Date.now();
        if (
          latestPrompt === autoCompanionLastPromptRef.current ||
          now - autoCompanionLastRequestAtRef.current < AUTO_COMPANION_MIN_INTERVAL
        ) {
          return;
        }

        autoCompanionLastPromptRef.current = latestPrompt;
        autoCompanionLastRequestAtRef.current = now;

        const coords = latestView.coordsAtPos(latestCursor);
        useAIStore.getState().setCompanionVisible(true, coords ? {
          x: coords.left,
          y: coords.bottom,
        } : undefined);
        useAIStore.getState().getCompanionSuggestion(latestPrompt);
      }, Math.max(500, currentSettings.ai.suggest_delay || 2000));
    };

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        setContent(newContent);
      }

      if (update.docChanged || update.selectionSet) {
        scheduleAutoCompanion(update.view);
      }
    });

    // High priority keymap to ensure Enter inserts newline immediately
    const enterKeymap = Prec.high(keymap.of([
      { key: 'Enter', run: insertNewline },
    ]));

    const state = EditorState.create({
      doc: initialContentRef.current,
      extensions: [
        enterKeymap,
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
        }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        updateListener,
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: `${initialAppearance.font_size}px`,
            fontFamily: initialAppearance.font_family,
          },
          '.cm-content': {
            caretColor: 'var(--text-color)',
            lineHeight: String(initialAppearance.line_height),
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          },
          '.cm-gutters': {
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            border: 'none',
          },
          '.cm-proofread-error': {
            backgroundColor: 'rgba(255, 107, 107, 0.2)',
            borderBottom: '2px solid #ff6b6b',
            cursor: 'pointer',
          },
        }),
        EditorView.lineWrapping,
        // 使用 Compartment 来动态更新装饰
        decorationsCompartmentRef.current.of(createProofreadDecorations([])),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    setEditorView(view);

    return () => {
      clearAutoCompanionTimer();
      view.destroy();
      viewRef.current = null;
      setEditorView(null);
    };
  }, [setContent, setEditorView]);

  useEffect(() => {
    if (autoCompanionTimerRef.current !== null) {
      window.clearTimeout(autoCompanionTimerRef.current);
      autoCompanionTimerRef.current = null;
    }

    if (!settings.ai.enabled || !settings.ai.auto_suggest || !viewRef.current) {
      useAIStore.getState().setCompanionVisible(false);
      return;
    }

    const view = viewRef.current;
    const selection = view.state.selection.main;
    if (!selection.empty) return;

    const textBefore = view.state.sliceDoc(Math.max(0, selection.to - AUTO_COMPANION_CONTEXT_LIMIT), selection.to);
    if (textBefore.trim().length < MIN_AUTO_COMPANION_CHARS) return;

    autoCompanionTimerRef.current = window.setTimeout(() => {
      const latestView = viewRef.current;
      const { settings: latestSettings } = useAppStore.getState();
      if (!latestView || !latestSettings.ai.enabled || !latestSettings.ai.auto_suggest) return;

      const latestSelection = latestView.state.selection.main;
      if (!latestSelection.empty) return;

      const latestTextBefore = latestView.state.sliceDoc(Math.max(0, latestSelection.to - AUTO_COMPANION_CONTEXT_LIMIT), latestSelection.to);
      const latestPrompt = latestTextBefore.trim();
      if (latestPrompt.length < MIN_AUTO_COMPANION_CHARS) return;

      const now = Date.now();
      if (
        latestPrompt === autoCompanionLastPromptRef.current ||
        now - autoCompanionLastRequestAtRef.current < AUTO_COMPANION_MIN_INTERVAL
      ) {
        return;
      }

      autoCompanionLastPromptRef.current = latestPrompt;
      autoCompanionLastRequestAtRef.current = now;

      const coords = latestView.coordsAtPos(latestSelection.to);
      useAIStore.getState().setCompanionVisible(true, coords ? {
        x: coords.left,
        y: coords.bottom,
      } : undefined);
      useAIStore.getState().getCompanionSuggestion(latestPrompt);
    }, Math.max(500, settings.ai.suggest_delay || 2000));
  }, [settings.ai.enabled, settings.ai.auto_suggest, settings.ai.suggest_delay]);

  useEffect(() => {
    if (viewRef.current) {
      const currentContent = viewRef.current.state.doc.toString();
      if (currentContent !== content) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: content,
          },
        });
      }
    }
  }, [content]);

  // 更新校对高亮 — 外层 try-catch 防止任何未预料的 CodeMirror panic 向上传播
  useEffect(() => {
    if (!viewRef.current) return;
    try {
      viewRef.current.dispatch({
        effects: decorationsCompartmentRef.current.reconfigure(
          createProofreadDecorations(proofreadResults)
        ),
      });
    } catch (err) {
      console.error('[proofread] 装饰更新失败，已忽略:', err);
    }
  }, [proofreadResults]);

  return (
    <div className={`editor-container ${className || ''}`} style={style}>
      <div className="editor-document-card">
        <div ref={editorRef} className="editor-content" />
      </div>
    </div>
  );
}
