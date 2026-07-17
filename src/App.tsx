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
import { AIDiffConfirmDialog } from './components/AI/AIDiffConfirmDialog';
import { AIChatbotPanel } from './components/Chatbot/AIChatbotPanel';
import { ImmersiveOutline } from './components/Immersive/ImmersiveOutline';
import { TitleBar } from './components/TitleBar/TitleBar';
import { ActivityBar } from './components/ActivityBar/ActivityBar';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { createElementScrollViewport, getSyncedScrollTop, type ObservableScrollViewport, type ScrollAnchor } from './utils/scrollSync';
import { getImmersiveWorkspacePolicy } from './utils/immersiveWorkspace';
import './styles/main.css';
import './styles/workbench.css';

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

const DEFAULT_EDITOR_RATIO = 0.5;
const SUPPORTED_THEMES = new Set([
  'vscode-light', 'vscode-dark',
  'inkwell-light', 'inkwell-dark',
  'claude-light', 'claude-dark',
  'notion-light', 'notion-dark',
]);
let themeSwitchFrame: number | null = null;

function resolveThemePreference(preference: string) {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vscode-dark' : 'vscode-light';
  }
  if (preference === 'dark') return 'vscode-dark';
  if (preference === 'light') return 'vscode-light';
  return SUPPORTED_THEMES.has(preference) ? preference : 'vscode-dark';
}

function applyThemeToDocument(preference: string) {
  const resolvedTheme = resolveThemePreference(preference);
  const root = document.documentElement;

  if (themeSwitchFrame !== null) window.cancelAnimationFrame(themeSwitchFrame);
  root.classList.add('theme-switching');
  root.setAttribute('data-theme', resolvedTheme);
  root.style.colorScheme = resolvedTheme.endsWith('-dark') ? 'dark' : 'light';
  window.dispatchEvent(new CustomEvent('markitdown-theme-change', { detail: resolvedTheme }));
  themeSwitchFrame = window.requestAnimationFrame(() => {
    root.classList.remove('theme-switching');
    themeSwitchFrame = null;
  });

  return resolvedTheme;
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
    setSidebarVisible,
    setSettingsOpen,
    openFile,
    convertDocument
  } = useAppStore();
  const editorView = useAppStore(state => state.editorView);
  const { proofreadResults, setProofreadPanelVisible, translationPosition, translationOriginal, translationResult, setTranslationVisible, chatbotVisible, setChatbotVisible } = useAIStore();

  const dividerRef = useRef<HTMLDivElement>(null);
  const sidebarDividerRef = useRef<HTMLDivElement>(null);
  const proofreadDividerRef = useRef<HTMLDivElement>(null);
  const chatbotDividerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isDraggingSidebar = useRef(false);
  const isDraggingProofread = useRef(false);
  const isDraggingChatbot = useRef(false);
  const dragFrame = useRef<number | null>(null);
  const pendingDrag = useRef<{ type: 'split' | 'sidebar' | 'proofread' | 'chatbot'; clientX: number } | null>(null);
  const dragBounds = useRef<DOMRect | null>(null);
  const layoutWidth = useRef<number | null>(null);
  const [proofreadPanelWidth, setProofreadPanelWidth] = useState(280);
  const [chatbotPanelWidth, setChatbotPanelWidth] = useState(340);
  const [previewScrollElement, setPreviewScrollElement] = useState<HTMLDivElement | null>(null);
  const [previewRenderVersion, setPreviewRenderVersion] = useState(0);
  const [activityView, setActivityView] = useState<'explorer' | 'search'>('explorer');
  const [immersiveOutlineCollapsed, setImmersiveOutlineCollapsed] = useState(false);
  const [immersivePreviewScrollElement, setImmersivePreviewScrollElement] = useState<HTMLDivElement | null>(null);
  const scrollSyncFrame = useRef<number | null>(null);
  const pendingScrollSync = useRef<{
    source: ObservableScrollViewport;
    target: ObservableScrollViewport;
    anchors: ScrollAnchor[];
  } | null>(null);
  const programmaticScrollRef = useRef<{ viewport: ObservableScrollViewport; top: number } | null>(null);
  const dragValues = useRef({ splitRatio, sidebarWidth, proofreadPanelWidth, chatbotPanelWidth });
  const immersivePolicy = getImmersiveWorkspacePolicy(mode, chatbotVisible);

  const balanceDocumentPanes = useCallback((proofreadWidth = proofreadPanelWidth, chatWidth = chatbotPanelWidth) => {
    const appBody = dividerRef.current?.closest('.app-body') as HTMLElement | null;
    const divider = dividerRef.current;
    if (!appBody || !divider) return;

    const hasProofreadPanel = proofreadResults.length > 0;
    const sidebarSpace = (sidebarVisible || outlineVisible) ? sidebarWidth + 6 : 0;
    const proofreadSpace = hasProofreadPanel ? proofreadWidth + 8 : 0;
    const chatbotSpace = chatbotVisible ? chatWidth + 8 : 0;
    // During a drag the container width is fixed; reuse its captured bounds to
    // avoid a synchronous layout read on every animation frame.
    const appBodyWidth = layoutWidth.current ?? appBody.clientWidth;
    const mainWidth = appBodyWidth - sidebarSpace - chatbotSpace;
    const documentWidth = mainWidth - proofreadSpace;
    if (mainWidth <= 0 || documentWidth <= 0) return;

    const ratio = Math.max(0.1, Math.min(0.9, (documentWidth * DEFAULT_EDITOR_RATIO) / mainWidth));
    const editor = divider.previousElementSibling as HTMLElement | null;
    const preview = divider.nextElementSibling as HTMLElement | null;
    if (editor) editor.style.flex = String(ratio);
    if (preview) preview.style.flex = String(1 - ratio);
    dragValues.current.splitRatio = ratio;
  }, [chatbotPanelWidth, chatbotVisible, outlineVisible, proofreadPanelWidth, proofreadResults.length, sidebarVisible, sidebarWidth]);

  const scheduleDragFrame = useCallback((type: 'split' | 'sidebar' | 'proofread' | 'chatbot', clientX: number) => {
    pendingDrag.current = { type, clientX };
    if (dragFrame.current !== null) return;

    dragFrame.current = window.requestAnimationFrame(() => {
      dragFrame.current = null;
      const drag = pendingDrag.current;
      const bounds = dragBounds.current;
      if (!drag || !bounds) return;

      if (drag.type === 'split') {
        const sidebarOffset = sidebarVisible ? sidebarWidth : 0;
        const ratio = Math.max(0.1, Math.min(0.9,
          (drag.clientX - bounds.left - sidebarOffset) / (bounds.width - sidebarOffset),
        ));
        const divider = dividerRef.current;
        const editor = divider?.previousElementSibling as HTMLElement | null;
        const preview = divider?.nextElementSibling as HTMLElement | null;
        if (editor) editor.style.flex = String(ratio);
        if (preview) preview.style.flex = String(1 - ratio);
        dragValues.current.splitRatio = ratio;
      } else if (drag.type === 'sidebar') {
        const width = Math.max(150, Math.min(400, drag.clientX - bounds.left));
        const sidebar = sidebarDividerRef.current?.previousElementSibling as HTMLElement | null;
        if (sidebar) sidebar.style.width = `${width}px`;
        dragValues.current.sidebarWidth = width;
      } else if (drag.type === 'proofread') {
        const width = Math.max(200, Math.min(500, bounds.right - drag.clientX));
        const panel = proofreadDividerRef.current?.nextElementSibling as HTMLElement | null;
        if (panel) panel.style.width = `${width}px`;
        dragValues.current.proofreadPanelWidth = width;
        balanceDocumentPanes(width, dragValues.current.chatbotPanelWidth);
      } else {
        const width = Math.max(200, Math.min(500, bounds.right - drag.clientX));
        const panel = chatbotDividerRef.current?.nextElementSibling as HTMLElement | null;
        if (panel) panel.style.width = `${width}px`;
        dragValues.current.chatbotPanelWidth = width;
        balanceDocumentPanes(dragValues.current.proofreadPanelWidth, width);
      }
    });
  }, [balanceDocumentPanes, sidebarVisible, sidebarWidth]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (mode === 'split') return;
    const exitImmersiveWorkspace = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useAppStore.getState().setMode('split');
    };
    window.addEventListener('keydown', exitImmersiveWorkspace);
    return () => window.removeEventListener('keydown', exitImmersiveWorkspace);
  }, [mode]);

  useEffect(() => {
    let wasCompact = false;
    const syncCompactLayout = () => {
      const compact = window.innerWidth < 900;
      if (compact && !wasCompact) {
        // Preserve the editor as the primary surface on narrow desktop
        // windows. The activity bar remains available to reopen the sidebar.
        setSidebarVisible(false);
      }
      wasCompact = compact;
    };

    syncCompactLayout();
    window.addEventListener('resize', syncCompactLayout);
    return () => window.removeEventListener('resize', syncCompactLayout);
  }, [setSidebarVisible]);

  useEffect(() => {
    const toFontStack = (fontFamily?: string) => {
      const family = fontFamily?.replace(/[;{}]/g, '').trim() || 'Microsoft YaHei';
      return `${family}, "Microsoft YaHei", sans-serif`;
    };

    const root = document.documentElement;
    root.style.setProperty('--font-sans', toFontStack(settings.appearance.ui_font_family));
    root.style.setProperty('--font-content', toFontStack(settings.appearance.font_family));
    root.style.setProperty('--font-content-size', `${settings.appearance.font_size}px`);
    root.style.setProperty('--font-content-line-height', String(settings.appearance.line_height));
  }, [
    settings.appearance.font_family,
    settings.appearance.font_size,
    settings.appearance.line_height,
    settings.appearance.ui_font_family,
  ]);

  useEffect(() => {
    const preference = settings.appearance.theme;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => applyThemeToDocument(preference);

    applyTheme();

    if (preference !== 'system') {
      return () => {
        document.documentElement.classList.remove('theme-switching');
      };
    }
    mediaQuery.addEventListener('change', applyTheme);
    return () => {
      mediaQuery.removeEventListener('change', applyTheme);
      document.documentElement.classList.remove('theme-switching');
    };
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
    dragBounds.current = dividerRef.current?.parentElement?.getBoundingClientRect() || null;
    layoutWidth.current = (dividerRef.current?.closest('.app-body') as HTMLElement | null)?.clientWidth ?? null;
    document.documentElement.classList.add('panel-resizing');
  }, []);

  const handleSplitMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;

    scheduleDragFrame('split', e.clientX);
  }, [scheduleDragFrame]);

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    dragBounds.current = sidebarDividerRef.current?.parentElement?.getBoundingClientRect() || null;
    layoutWidth.current = (sidebarDividerRef.current?.closest('.app-body') as HTMLElement | null)?.clientWidth ?? null;
    document.documentElement.classList.add('panel-resizing');
  }, []);

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSidebar.current) return;

    scheduleDragFrame('sidebar', e.clientX);
  }, [scheduleDragFrame]);

  const handleProofreadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingProofread.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    dragBounds.current = proofreadDividerRef.current?.parentElement?.getBoundingClientRect() || null;
    layoutWidth.current = (proofreadDividerRef.current?.closest('.app-body') as HTMLElement | null)?.clientWidth ?? null;
    document.documentElement.classList.add('panel-resizing');
  }, []);

  const handleProofreadMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingProofread.current) return;

    scheduleDragFrame('proofread', e.clientX);
  }, [scheduleDragFrame]);

  const handleChatbotMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingChatbot.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    dragBounds.current = chatbotDividerRef.current?.parentElement?.getBoundingClientRect() || null;
    layoutWidth.current = (chatbotDividerRef.current?.closest('.app-body') as HTMLElement | null)?.clientWidth ?? null;
    document.documentElement.classList.add('panel-resizing');
  }, []);

  const handleChatbotMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingChatbot.current) return;

    scheduleDragFrame('chatbot', e.clientX);
  }, [scheduleDragFrame]);

  useEffect(() => {
    const rebalancePanels = () => {
      const appBody = dividerRef.current?.closest('.app-body') as HTMLElement | null;
      if (!appBody) return;
      const sidebarSpace = (sidebarVisible || outlineVisible) ? sidebarWidth + 6 : 0;
      const proofreadSpace = proofreadResults.length > 0 ? proofreadPanelWidth + 8 : 0;
      const availableWidth = appBody.clientWidth - sidebarSpace - proofreadSpace;
      const nextChatWidth = chatbotVisible
        ? Math.max(200, Math.min(500, Math.round((availableWidth - 8) / 3)))
        : chatbotPanelWidth;

      if (chatbotVisible && Math.abs(nextChatWidth - chatbotPanelWidth) > 1) {
        setChatbotPanelWidth(nextChatWidth);
        dragValues.current.chatbotPanelWidth = nextChatWidth;
      }
      balanceDocumentPanes(proofreadPanelWidth, nextChatWidth);
      setSplitRatio(dragValues.current.splitRatio);
    };

    const frame = window.requestAnimationFrame(rebalancePanels);
    window.addEventListener('resize', rebalancePanels);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', rebalancePanels);
    };
  }, [balanceDocumentPanes, chatbotPanelWidth, chatbotVisible, outlineVisible, proofreadPanelWidth, proofreadResults.length, setSplitRatio, sidebarVisible, sidebarWidth]);

  const selectActivityView = useCallback((view: 'explorer' | 'search') => {
    if (sidebarVisible && activityView === view) {
      setSidebarVisible(false);
      return;
    }
    setActivityView(view);
    if (!sidebarVisible) setSidebarVisible(true);
  }, [activityView, setSidebarVisible, sidebarVisible]);

  const toggleThemeVariant = useCallback(() => {
    const currentSettings = useAppStore.getState().settings;
    const currentTheme = resolveThemePreference(currentSettings.appearance.theme);
    const isDark = currentTheme.endsWith('-dark');
    const family = currentTheme.replace(/-(?:light|dark)$/, '') || 'vscode';
    const nextTheme = `${family}-${isDark ? 'light' : 'dark'}`;
    const nextSettings = {
      ...currentSettings,
      appearance: { ...currentSettings.appearance, theme: nextTheme },
    };

    // Desktop persistence crosses the Tauri bridge and may be delayed. Apply
    // the visual state synchronously so the activity-bar button always gives
    // immediate feedback, then persist the same value in the background.
    applyThemeToDocument(nextTheme);
    void useAppStore.getState().saveSettings(nextSettings);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      setSplitRatio(dragValues.current.splitRatio);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (isDraggingSidebar.current) {
      isDraggingSidebar.current = false;
      setSidebarWidth(dragValues.current.sidebarWidth);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (isDraggingProofread.current) {
      isDraggingProofread.current = false;
      setProofreadPanelWidth(dragValues.current.proofreadPanelWidth);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (isDraggingChatbot.current) {
      isDraggingChatbot.current = false;
      setChatbotPanelWidth(dragValues.current.chatbotPanelWidth);
      setSplitRatio(dragValues.current.splitRatio);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    pendingDrag.current = null;
    dragBounds.current = null;
    layoutWidth.current = null;
    document.documentElement.classList.remove('panel-resizing');
  }, [setChatbotPanelWidth, setProofreadPanelWidth, setSidebarWidth, setSplitRatio]);

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

  const handlePreviewContentRendered = useCallback(() => {
    setPreviewRenderVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (mode !== 'split' || !editorView || !previewScrollElement) return undefined;

    const editorViewport: ObservableScrollViewport = editorView;
    const previewViewport = createElementScrollViewport(previewScrollElement);

    const editorMax = Math.max(0, editorViewport.getScrollHeight() - editorViewport.getClientHeight());
    const previewMax = Math.max(0, previewViewport.getScrollHeight() - previewViewport.getClientHeight());
    const previewBounds = previewScrollElement.getBoundingClientRect();
    const headingAnchors: ScrollAnchor[] = Array.from(
      previewScrollElement.querySelectorAll<HTMLElement>('[data-source-line]'),
    ).flatMap((heading) => {
      const lineNumber = Number(heading.dataset.sourceLine);
      if (!Number.isFinite(lineNumber)) return [];
      const targetTop = heading.getBoundingClientRect().top
        - previewBounds.top
        + previewScrollElement.scrollTop;
      return [{
        sourceTop: Math.max(0, Math.min(editorView.getTopForLineNumber(lineNumber), editorMax)),
        targetTop: Math.max(0, Math.min(targetTop, previewMax)),
      }];
    });
    const editorToPreviewAnchors = [
      { sourceTop: 0, targetTop: 0 },
      ...headingAnchors,
      { sourceTop: editorMax, targetTop: previewMax },
    ];
    const previewToEditorAnchors = editorToPreviewAnchors.map((anchor) => ({
      sourceTop: anchor.targetTop,
      targetTop: anchor.sourceTop,
    }));

    const syncScroll = (
      source: ObservableScrollViewport,
      target: ObservableScrollViewport,
      anchors: ScrollAnchor[],
    ) => {
      const ignored = programmaticScrollRef.current;
      if (ignored?.viewport === source && Math.abs(source.getScrollTop() - ignored.top) < 2) {
        return;
      }

      pendingScrollSync.current = { source, target, anchors };
      if (scrollSyncFrame.current !== null) return;

      scrollSyncFrame.current = window.requestAnimationFrame(() => {
        scrollSyncFrame.current = null;
        const request = pendingScrollSync.current;
        pendingScrollSync.current = null;
        if (!request) return;

        const { source: latestSource, target: latestTarget, anchors: latestAnchors } = request;
        const nextTop = getSyncedScrollTop(latestSource, latestTarget, latestAnchors);

        // A tiny threshold avoids expensive layout work from sub-pixel scroll events
        // while preserving the feel of one-to-one scrolling for long documents.
        if (Math.abs(latestTarget.getScrollTop() - nextTop) < 2) return;

        programmaticScrollRef.current = { viewport: latestTarget, top: nextTop };
        latestTarget.setScrollTop(nextTop);
      });
    };

    const stopEditorScroll = editorViewport.onScroll(() => syncScroll(editorViewport, previewViewport, editorToPreviewAnchors));
    const stopPreviewScroll = previewViewport.onScroll(() => syncScroll(previewViewport, editorViewport, previewToEditorAnchors));

    // Rendering Markdown, images or diagrams changes preview geometry. Keep
    // the editor as the source of truth and realign once the new layout exists.
    syncScroll(editorViewport, previewViewport, editorToPreviewAnchors);

    return () => {
      stopEditorScroll();
      stopPreviewScroll();

      if (scrollSyncFrame.current !== null) {
        window.cancelAnimationFrame(scrollSyncFrame.current);
        scrollSyncFrame.current = null;
      }

      pendingScrollSync.current = null;
      programmaticScrollRef.current = null;
    };
  }, [mode, editorView, previewScrollElement, previewRenderVersion]);

  return (
    <div className={`app ${immersivePolicy.active ? 'immersive-mode-active' : ''} ${mode === 'zen' ? 'zen-mode' : ''}`}>
      <TitleBar />
      <div className="app-workbench">
        <ActivityBar
          activeView={activityView}
          chatbotVisible={chatbotVisible}
          settingsOpen={settingsOpen}
          immersive={mode === 'immersive'}
          zen={mode === 'zen'}
          theme={settings.appearance.theme}
          onSelectView={selectActivityView}
          onOpenChat={() => setChatbotVisible(!chatbotVisible)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleTheme={toggleThemeVariant}
          onSelectImmersive={() => useAppStore.getState().setMode('immersive')}
          onSelectZen={() => useAppStore.getState().setMode('zen')}
          onExitImmersive={() => useAppStore.getState().setMode('split')}
        />
        <div className="app-workbench-content">
          <div className="app-body">
          {mode === 'split' && (sidebarVisible || outlineVisible) && (
          <>
            <Sidebar style={{ width: sidebarWidth }} view={activityView} />
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
              <section className="document-pane editor-workspace-pane" style={{ flex: splitRatio }}>
                <div className="document-pane-tabs">
                  <TabsBar />
                </div>
                <div className="editor-pane-toolbar">
                  <Toolbar />
                </div>
                <Editor className="editor-pane" />
              </section>
              <div
                ref={dividerRef}
                className="divider resizable"
                onMouseDown={handleSplitMouseDown}
              />
              <section className="document-pane preview-workspace-pane" style={{ flex: 1 - splitRatio }}>
                <div className="document-pane-tabs">
                  <TabsBar />
                </div>
                <div className="preview-with-panel">
                  <Preview
                    className="preview-pane"
                    style={{ flex: 1 }}
                    onScrollContainerReady={handlePreviewScrollContainerReady}
                    onContentRendered={handlePreviewContentRendered}
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
              </section>
            </>
          ) : (
            <section
              className={`immersive-workspace immersive-${immersivePolicy.kind}`}
              aria-label={mode === 'zen' ? '沉浸写作' : '沉浸阅读'}
            >
              {immersivePolicy.showOutline && (
                <ImmersiveOutline
                  mode={mode}
                  collapsed={immersiveOutlineCollapsed}
                  previewScrollElement={immersivePreviewScrollElement}
                  onToggle={() => setImmersiveOutlineCollapsed((collapsed) => !collapsed)}
                />
              )}
              <div className="immersive-document-area">
                <header className="immersive-command-strip">
                  {immersivePolicy.showEditorToolbar ? (
                    <div className="immersive-writing-toolbar" aria-label="编辑器快捷工具栏">
                      <Toolbar />
                    </div>
                  ) : (
                    <div className="immersive-reading-label">
                      <span aria-hidden="true">◫</span>
                      <strong>沉浸阅读</strong>
                    </div>
                  )}
                  <div className="immersive-command-actions">
                    <button
                      className={`immersive-control-button ${chatbotVisible ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => setChatbotVisible(!chatbotVisible)}
                      title={chatbotVisible ? '收起 AI 对话' : '打开 AI 对话'}
                      aria-pressed={chatbotVisible}
                    >
                      <span className="immersive-ai-button-mark" aria-hidden="true">AI</span>
                      <span>对话</span>
                    </button>
                    <button
                      className="immersive-control-button"
                      type="button"
                      onClick={() => useAppStore.getState().setMode('split')}
                      title={`退出${mode === 'zen' ? '沉浸写作' : '沉浸阅读'} (Esc)`}
                    >
                      <span aria-hidden="true">↙</span>
                      <span>退出</span>
                    </button>
                  </div>
                </header>
                <div className="immersive-document-surface">
                  {mode === 'zen' ? (
                    <Editor className="zen-editor-pane" />
                  ) : (
                    <Preview
                      className="immersive-preview"
                      onScrollContainerReady={setImmersivePreviewScrollElement}
                    />
                  )}
                </div>
              </div>
            </section>
          )}
        </main>
          </div>
          {chatbotVisible && (
          <>
            <div
              ref={chatbotDividerRef}
              className={`chatbot-divider resizable ${immersivePolicy.active ? 'immersive-chatbot-divider' : ''}`}
              onMouseDown={handleChatbotMouseDown}
            />
            <div className={`chatbot-side-panel ${immersivePolicy.active ? 'immersive-chatbot-panel' : ''}`} style={{ width: chatbotPanelWidth }}>
              <AIChatbotPanel />
            </div>
          </>
          )}
          </div>
        </div>
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
          const { editorView, content } = useAppStore.getState();
          const selection = editorView?.state.selection.main;
          const from = selection?.from ?? content.length;
          const to = selection?.to ?? content.length;
          useAIStore.getState().proposeEdit({
            kind: 'translation',
            reason: 'AI 翻译：请核对术语、人名和数字等可能影响事实准确性的内容。',
            before: content.slice(from, to),
            after: text,
            from,
            to,
          });
          setTranslationVisible(false);
        }}
      />
      <AIDiffConfirmDialog />
    </div>
  );
}

export default App;
