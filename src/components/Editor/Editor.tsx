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

// 创建装饰函数
const createProofreadDecorations = (results: ProofreadResult[]) => {
  return EditorView.decorations.of((view) => {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;

    for (const result of results) {
      if (result.from <= doc.length && result.to <= doc.length && result.from < result.to) {
        builder.add(result.from, result.to, proofreadErrorMark);
      }
    }

    return builder.finish();
  });
};

export function Editor({ className, style }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const decorationsCompartmentRef = useRef(new Compartment());
  const { content, setContent, settings, setEditorView } = useAppStore();
  const { proofreadResults } = useAIStore();
  const initialContentRef = useRef(content);
  const initialAppearanceRef = useRef(settings.appearance);

  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;
    const initialAppearance = initialAppearanceRef.current;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        setContent(newContent);
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
      view.destroy();
      viewRef.current = null;
      setEditorView(null);
    };
  }, [setContent, setEditorView]);

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

  // 更新校对高亮
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: decorationsCompartmentRef.current.reconfigure(
          createProofreadDecorations(proofreadResults)
        ),
      });
    }
  }, [proofreadResults]);

  return (
    <div className={`editor-container ${className || ''}`} style={style}>
      <div ref={editorRef} className="editor-content" />
    </div>
  );
}
