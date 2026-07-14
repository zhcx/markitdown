import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from './stores/appStore';
import { useAIStore } from './stores/aiStore';
import { TabsBar } from './components/TabsBar/TabsBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Editor } from './components/Editor/Editor';
import { Preview } from './components/Preview/Preview';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { StatusBar } from './components/StatusBar/StatusBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { AICompanionPopup } from './components/AI/AICompanionPopup';
import { AITranslationPopup } from './components/AI/AITranslationPopup';
import { AIChatbotPanel } from './components/Chatbot/AIChatbotPanel';
import { TitleBar } from './components/TitleBar/TitleBar';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import './styles/main.css';

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

function App() {
  const {
    mode,
    settingsOpen,
    sidebarVisible,
    sidebarWidth,
    outlineVisible,
    loadSettings,
    settings,
    splitRatio,
    setSplitRatio,
    setSidebarWidth,
    openFile,
    convertDocument
  } = useAppStore();
  const editorView = useAppStore(state => state.editorView);
  const { proofreadResults, setProofreadPanelVisible, translationPosition, translationOriginal, translationResult, setTranslationVisible, chatbotVisible } = useAIStore();

  const dividerRef = useRef<HTMLDivElement>(null);
  const sidebarDividerRef = useRef<HTMLDivElement>(null);
  const proofreadDividerRef = useRef<HTMLDivElement>(null);
  const chatbotDividerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isDraggingSidebar = useRef(false);
  const isDraggingProofread = useRef(false);
  const isDraggingChatbot = useRef(false);
  const [proofreadPanelWidth, setProofreadPanelWidth] = useState(280);
  const [chatbotPanelWidth, setChatbotPanelWidth] = useState(340);
  const [previewScrollElement, setPreviewScrollElement] = useState<HTMLDivElement | null>(null);
  const scrollSyncFrame = useRef<number | null>(null);
  const pendingScrollSync = useRef<{ source: HTMLElement; target: HTMLElement } | null>(null);
  const programmaticScrollRef = useRef<{ element: HTMLElement; top: number } | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const preference = settings.appearance.theme;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      let resolvedTheme = preference === 'system'
        ? (mediaQuery.matches ? 'inkwell-dark' : 'inkwell-light')
        : preference;

      // Keep older saved themes working, but never leave the UI without a
      // complete token set when a malformed value makes it into settings.
      if (!['inkwell-light', 'inkwell-dark', 'claude-light', 'claude-dark', 'notion-light', 'notion-dark'].includes(resolvedTheme)) {
        resolvedTheme = 'inkwell-light';
      }

      document.documentElement.setAttribute('data-theme', resolvedTheme);
      document.documentElement.style.colorScheme = resolvedTheme.endsWith('-dark') ? 'dark' : 'light';
      window.dispatchEvent(new CustomEvent('markitdown-theme-change', { detail: resolvedTheme }));
    };

    applyTheme();

    if (preference !== 'system') return undefined;
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [settings.appearance.theme]);

  // Listen for Tauri file drop events using webview window
  useEffect(() => {
    // Keep the native drag-and-drop integration out of plain browser previews.
    // Tauri injects this internal bridge for every desktop webview.
    if (!('__TAURI_INTERNALS__' in window)) return undefined;

    const webview = getCurrentWebviewWindow();

    const unlisten = webview.listen<DragDropPayload>('tauri://drag-drop', async (event) => {
      const paths = event.payload.paths;
      for (const path of paths) {
        const lowerPath = path.toLowerCase();
        if (lowerPath.endsWith('.md') || lowerPath.endsWith('.txt') || lowerPath.endsWith('.markdown')) {
          await openFile(path);
        } else {
          try {
            await convertDocument(path);
          } catch (error) {
            console.error('Document conversion failed:', error);
            window.alert(`文档转换失败：${String(error)}`);
          }
        }
      }
    });

    return () => { unlisten.then(fn => fn()); };
  }, [convertDocument, openFile]);

  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleSplitMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;

    const mainContent = dividerRef.current?.parentElement;
    if (!mainContent) return;

    const rect = mainContent.getBoundingClientRect();
    const sidebarOffset = sidebarVisible ? sidebarWidth : 0;
    const newRatio = (e.clientX - rect.left - sidebarOffset) / (rect.width - sidebarOffset);
    setSplitRatio(newRatio);
  }, [setSplitRatio, sidebarVisible, sidebarWidth]);

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSidebar.current) return;

    const appBody = sidebarDividerRef.current?.parentElement;
    if (!appBody) return;

    const rect = appBody.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    setSidebarWidth(newWidth);
  }, [setSidebarWidth]);

  const handleProofreadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingProofread.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleProofreadMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingProofread.current) return;

    const container = proofreadDividerRef.current?.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const newWidth = rect.right - e.clientX;
    setProofreadPanelWidth(Math.max(200, Math.min(500, newWidth)));
  }, []);

  const handleChatbotMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingChatbot.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleChatbotMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingChatbot.current) return;

    const container = chatbotDividerRef.current?.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const newWidth = rect.right - e.clientX;
    setChatbotPanelWidth(Math.max(200, Math.min(500, newWidth)));
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (isDraggingSidebar.current) {
      isDraggingSidebar.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (isDraggingProofread.current) {
      isDraggingProofread.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (isDraggingChatbot.current) {
      isDraggingChatbot.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleSplitMouseMove);
    document.addEventListener('mousemove', handleSidebarMouseMove);
    document.addEventListener('mousemove', handleProofreadMouseMove);
    document.addEventListener('mousemove', handleChatbotMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleSplitMouseMove);
      document.removeEventListener('mousemove', handleSidebarMouseMove);
      document.removeEventListener('mousemove', handleProofreadMouseMove);
      document.removeEventListener('mousemove', handleChatbotMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleSplitMouseMove, handleSidebarMouseMove, handleProofreadMouseMove, handleChatbotMouseMove, handleMouseUp]);

  const handlePreviewScrollContainerReady = useCallback((element: HTMLDivElement | null) => {
    setPreviewScrollElement(element);
  }, []);

  useEffect(() => {
    if (mode !== 'split' || !editorView || !previewScrollElement) return undefined;

    const editorScrollElement = editorView.scrollDOM;

    const getScrollRatio = (element: HTMLElement) => {
      const maxScrollTop = element.scrollHeight - element.clientHeight;
      return maxScrollTop > 0 ? element.scrollTop / maxScrollTop : 0;
    };

    const syncScroll = (source: HTMLElement, target: HTMLElement) => {
      const ignored = programmaticScrollRef.current;
      if (ignored?.element === source && Math.abs(source.scrollTop - ignored.top) < 2) {
        return;
      }

      pendingScrollSync.current = { source, target };
      if (scrollSyncFrame.current !== null) return;

      scrollSyncFrame.current = window.requestAnimationFrame(() => {
        scrollSyncFrame.current = null;
        const request = pendingScrollSync.current;
        pendingScrollSync.current = null;
        if (!request) return;

        const { source: latestSource, target: latestTarget } = request;
        const targetMaxScrollTop = latestTarget.scrollHeight - latestTarget.clientHeight;
        const nextTop = targetMaxScrollTop > 0 ? getScrollRatio(latestSource) * targetMaxScrollTop : 0;

        // A tiny threshold avoids expensive layout work from sub-pixel scroll events
        // while preserving the feel of one-to-one scrolling for long documents.
        if (Math.abs(latestTarget.scrollTop - nextTop) < 2) return;

        programmaticScrollRef.current = { element: latestTarget, top: nextTop };
        latestTarget.scrollTop = nextTop;
      });
    };

    const handleEditorScroll = () => syncScroll(editorScrollElement, previewScrollElement);
    const handlePreviewScroll = () => syncScroll(previewScrollElement, editorScrollElement);

    editorScrollElement.addEventListener('scroll', handleEditorScroll, { passive: true });
    previewScrollElement.addEventListener('scroll', handlePreviewScroll, { passive: true });

    return () => {
      editorScrollElement.removeEventListener('scroll', handleEditorScroll);
      previewScrollElement.removeEventListener('scroll', handlePreviewScroll);

      if (scrollSyncFrame.current !== null) {
        window.cancelAnimationFrame(scrollSyncFrame.current);
        scrollSyncFrame.current = null;
      }

      pendingScrollSync.current = null;
      programmaticScrollRef.current = null;
    };
  }, [mode, editorView, previewScrollElement]);

  return (
    <div className="app">
      <TitleBar />
      <header className="app-chrome">
        <div className="app-tabs-row"><TabsBar /></div>
        <div className="app-toolbar-row"><Toolbar /></div>
      </header>
      <div className="app-body">
        {(sidebarVisible || outlineVisible) && (
          <>
            <Sidebar style={{ width: sidebarWidth }} />
            <div
              ref={sidebarDividerRef}
              className="sidebar-divider resizable"
              onMouseDown={handleSidebarMouseDown}
            />
          </>
        )}
        <div className="workspace-shell">
        <main className={`main-content ${mode}`}>
          {mode === 'split' ? (
            <>
              <Editor className="editor-pane" style={{ flex: splitRatio }} />
              <div
                ref={dividerRef}
                className="divider resizable"
                onMouseDown={handleSplitMouseDown}
              />
              <div className="preview-with-panel" style={{ flex: 1 - splitRatio }}>
                <Preview
                  className="preview-pane"
                  style={{ flex: 1 }}
                  onScrollContainerReady={handlePreviewScrollContainerReady}
                />
                {proofreadResults.length > 0 && (
                  <>
                    <div
                      ref={proofreadDividerRef}
                      className="proofread-divider resizable"
                      onMouseDown={handleProofreadMouseDown}
                    />
                    <div className="proofread-side-panel" style={{ width: proofreadPanelWidth }}>
                      <div className="proofread-side-header">
                        <h4>校对建议 ({proofreadResults.length})</h4>
                        <button className="close-btn" onClick={() => {
                          setProofreadPanelVisible(false);
                          useAIStore.getState().clearResults();
                        }}>×</button>
                      </div>
                      <div className="proofread-side-list">
                        {proofreadResults.map((result, index) => (
                          <div key={index} className="proofread-side-item">
                            <div className="proofread-type-badge" data-type={result.type}>
                              {result.type === 'spelling' ? '错字' :
                               result.type === 'grammar' ? '语法' :
                               result.type === 'punctuation' ? '标点' :
                               result.type === 'markdown' ? 'MD语法' :
                               result.type === 'layout' ? '排版' : '风格'}
                            </div>
                            <div className="proofread-content">
                              <div className="original-text">
                                <span className="label">原文:</span>
                                <span className="text strikethrough">{result.original}</span>
                              </div>
                              <div className="suggestion-text">
                                <span className="label">建议:</span>
                                <span className="text highlight">{result.suggestion}</span>
                              </div>
                              <div className="explanation-text">{result.explanation}</div>
                            </div>
                            <button
                              className="apply-fix-btn"
                              onClick={() => useAIStore.getState().applyProofreadFix(result)}
                            >
                              应用
                            </button>
                            <button
                              className="proofread-ignore-btn"
                              onClick={() => useAIStore.getState().ignoreProofreadResult(result)}
                            >
                              忽略
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <Preview className="immersive-preview" />
          )}
        </main>
        </div>
        {chatbotVisible && (
          <>
            <div
              ref={chatbotDividerRef}
              className="chatbot-divider resizable"
              onMouseDown={handleChatbotMouseDown}
            />
            <div className="chatbot-side-panel" style={{ width: chatbotPanelWidth }}>
              <AIChatbotPanel />
            </div>
          </>
        )}
      </div>
      <StatusBar />
      {settingsOpen && <SettingsPanel />}
      <AICompanionPopup />
      <AITranslationPopup
        originalText={translationOriginal}
        translatedText={translationResult}
        position={translationPosition}
        onClose={() => setTranslationVisible(false)}
        onApply={(text) => {
          const { editorView } = useAppStore.getState();
          if (editorView) {
            const selection = editorView.state.selection.main;
            const transaction = editorView.state.update({
              changes: { from: selection.from, to: selection.to, insert: text },
            });
            editorView.dispatch(transaction);
            editorView.focus();
          }
        }}
      />
    </div>
  );
}

export default App;
