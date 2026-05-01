import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from './stores/appStore';
import { MenuBar } from './components/MenuBar/MenuBar';
import { TabsBar } from './components/TabsBar/TabsBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Editor } from './components/Editor/Editor';
import { Preview } from './components/Preview/Preview';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { StatusBar } from './components/StatusBar/StatusBar';
import { Sidebar } from './components/Sidebar/Sidebar';
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
    loadSettings,
    settings,
    splitRatio,
    setSplitRatio,
    setSidebarWidth,
    openFile
  } = useAppStore();

  const dividerRef = useRef<HTMLDivElement>(null);
  const sidebarDividerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isDraggingSidebar = useRef(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.appearance.theme);
  }, [settings.appearance.theme]);

  // Listen for Tauri file drop events using webview window
  useEffect(() => {
    const webview = getCurrentWebviewWindow();

    const unlisten = webview.listen<DragDropPayload>('tauri://drag-drop', async (event) => {
      const paths = event.payload.paths;
      for (const path of paths) {
        const lowerPath = path.toLowerCase();
        if (lowerPath.endsWith('.md') || lowerPath.endsWith('.txt') || lowerPath.endsWith('.markdown')) {
          await openFile(path);
        }
      }
    });

    return () => { unlisten.then(fn => fn()); };
  }, [openFile]);

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
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleSplitMouseMove);
    document.addEventListener('mousemove', handleSidebarMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleSplitMouseMove);
      document.removeEventListener('mousemove', handleSidebarMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleSplitMouseMove, handleSidebarMouseMove, handleMouseUp]);

  return (
    <div className="app">
      <MenuBar />
      <TabsBar />
      <Toolbar />
      <div className="app-body">
        {sidebarVisible && (
          <>
            <Sidebar style={{ width: sidebarWidth }} />
            <div
              ref={sidebarDividerRef}
              className="sidebar-divider resizable"
              onMouseDown={handleSidebarMouseDown}
            />
          </>
        )}
        <main className={`main-content ${mode}`}>
          {mode === 'split' ? (
            <>
              <Editor className="editor-pane" style={{ flex: splitRatio }} />
              <div
                ref={dividerRef}
                className="divider resizable"
                onMouseDown={handleSplitMouseDown}
              />
              <Preview className="preview-pane" style={{ flex: 1 - splitRatio }} />
            </>
          ) : (
            <Preview className="immersive-preview" />
          )}
        </main>
      </div>
      <StatusBar />
      {settingsOpen && <SettingsPanel />}
    </div>
  );
}

export default App;