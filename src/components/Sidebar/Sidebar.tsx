import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/appStore';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  file?: File;
  directoryHandle?: FileSystemDirectoryHandle;
}

interface RawFileNode {
  name: string;
  path: string;
  is_directory?: boolean;
  isDirectory?: boolean;
  children?: RawFileNode[];
}

interface HeadingItem {
  level: number;
  text: string;
  line: number;
}

interface SidebarProps {
  style?: React.CSSProperties;
}

type ContextMenuState = { x: number; y: number; node: FileNode } | null;

const OPEN_EDITORS_ID = 'virtual:open-editors';
const isTauriRuntime = () => '__TAURI_INTERNALS__' in window;
const isDirectOpenFile = (name: string) => /\.(md|markdown|txt)$/i.test(name);

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

const getFolderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;
const normalizeNode = (node: RawFileNode): FileNode => ({
  name: node.name,
  path: node.path,
  isDirectory: Boolean(node.isDirectory ?? node.is_directory),
  children: node.children?.map(normalizeNode),
});

const parseHeadings = (content: string): HeadingItem[] => content.split('\n').flatMap((line, index) => {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  return match ? [{ level: match[1].length, text: match[2].trim(), line: index + 1 }] : [];
});

function Chevron({ expanded }: { expanded: boolean }) {
  return <span className={`explorer-chevron ${expanded ? 'expanded' : ''}`} aria-hidden="true" />;
}

function FolderIcon({ open: isOpen = false }: { open?: boolean }) {
  return <span className={`explorer-icon folder-icon ${isOpen ? 'open' : ''}`} aria-hidden="true" />;
}

function FileIcon({ filename }: { filename: string }) {
  const extension = filename.split('.').pop()?.toLowerCase();
  const kind = extension === 'md' || extension === 'markdown' ? 'markdown'
    : extension === 'txt' ? 'text'
      : extension === 'json' ? 'json'
        : 'document';
  return <span className={`explorer-icon file-icon ${kind}`} aria-hidden="true">{kind === 'markdown' ? 'M' : ''}</span>;
}

export function Sidebar({ style }: SidebarProps) {
  const {
    sidebarVisible,
    outlineVisible,
    setOutlineVisible,
    content,
    openFile,
    convertDocument,
    tabs,
    activeTabId,
    currentFile,
    timeline,
    restoreTimelineEntry,
  } = useAppStore();
  const [folderTree, setFolderTree] = useState<FileNode[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([OPEN_EDITORS_ID]));
  const [loadedFolders, setLoadedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const headings = useMemo(() => parseHeadings(content), [content]);
  const activeTimeline = activeTabId ? timeline[activeTabId] || [] : [];

  const readBrowserFolder = useCallback(async (handle: FileSystemDirectoryHandle, parentPath: string): Promise<FileNode[]> => {
    const entries: FileNode[] = [];
    for await (const [name, entry] of (handle as DirectoryHandleWithEntries).entries()) {
      const path = `${parentPath}/${name}`;
      if (entry.kind === 'directory') {
        entries.push({ name, path, isDirectory: true, children: [], directoryHandle: entry as FileSystemDirectoryHandle });
      } else if (isDirectOpenFile(name)) {
        entries.push({ name, path, isDirectory: false, file: await (entry as FileSystemFileHandle).getFile() });
      }
    }
    return entries.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  }, []);

  const readFolder = useCallback(async (folderPath: string) => {
    const tree = await invoke<RawFileNode[]>('read_folder', { path: folderPath });
    return (tree || []).map(normalizeNode);
  }, []);

  const loadFolderContents = useCallback(async (folderPath: string) => {
    try {
      const tree = await readFolder(folderPath);
      setFolderTree(tree);
      setLoadedFolders(previous => new Set(previous).add(folderPath));
      setExpandedNodes(previous => new Set(previous).add(folderPath));
    } catch (error) {
      console.error('Failed to load folder contents:', error);
      setFolderTree([]);
    }
  }, [readFolder]);

  useEffect(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (!activeTab?.path) return;
    void invoke('update_recent_file', { path: activeTab.path, title: activeTab.title }).catch(() => undefined);
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (!currentFile || currentFile.startsWith('web://')) return;
    const parent = currentFile.replace(/[\\/][^\\/]+$/, '');
    if (parent && parent !== currentFolder) {
      queueMicrotask(() => {
        setCurrentFolder(parent);
        void loadFolderContents(parent);
      });
    }
  }, [currentFile, currentFolder, loadFolderContents]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const toggleExpanded = (path: string) => {
    setExpandedNodes(previous => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const replaceNodeChildren = (nodes: FileNode[], path: string, children: FileNode[]): FileNode[] => nodes.map(node => {
    if (node.path === path) return { ...node, children };
    return node.children ? { ...node, children: replaceNodeChildren(node.children, path, children) } : node;
  });

  const toggleFolder = async (node: FileNode) => {
    if (expandedNodes.has(node.path)) {
      toggleExpanded(node.path);
      return;
    }
    setExpandedNodes(previous => new Set(previous).add(node.path));
    if (loadedFolders.has(node.path)) return;
    try {
      const children = node.directoryHandle
        ? await readBrowserFolder(node.directoryHandle, node.path)
        : await readFolder(node.path);
      setFolderTree(previous => replaceNodeChildren(previous, node.path, children));
      setLoadedFolders(previous => new Set(previous).add(node.path));
    } catch (error) {
      console.error('Failed to load folder children:', error);
    }
  };

  const openTreeFile = async (node: FileNode) => {
    if (node.file) {
      useAppStore.getState().addTab({ path: node.path, title: node.name, content: await node.file.text(), modified: false });
    } else if (isDirectOpenFile(node.name)) {
      await openFile(node.path);
    } else {
      await convertDocument(node.path);
    }
  };

  const scrollToHeading = (line: number) => {
    const { editorView } = useAppStore.getState();
    if (!editorView) return;
    const position = editorView.state.doc.line(line).from;
    editorView.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    editorView.focus();
  };

  const handleOpenFolder = async () => {
    try {
      if (!isTauriRuntime()) {
        const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
        if (!picker) throw new Error('请使用最新版 Chrome 或 Edge 选择文件夹。');
        const handle = await picker();
        const path = `web://${handle.name}`;
        setCurrentFolder(path);
        setFolderTree(await readBrowserFolder(handle, path));
        setLoadedFolders(new Set([path]));
        setExpandedNodes(previous => new Set(previous).add(path));
        return;
      }
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setCurrentFolder(selected as string);
        await loadFolderContents(selected as string);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  const handleOpenFile = async () => {
    try {
      const selected = await open({ filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }], multiple: true });
      if (!selected) return;
      for (const path of (Array.isArray(selected) ? selected : [selected])) await openFile(path as string);
      setExpandedNodes(previous => new Set(previous).add(OPEN_EDITORS_ID));
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const renderNodes = (nodes: FileNode[], depth = 0) => nodes.map(node => {
    const expanded = expandedNodes.has(node.path);
    const active = currentFile === node.path;
    return (
      <div key={node.path} role="treeitem" aria-expanded={node.isDirectory ? expanded : undefined}>
        <button
          className={`explorer-row ${node.isDirectory ? 'folder-row' : 'file-row'} ${active ? 'active' : ''}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => node.isDirectory ? void toggleFolder(node) : void openTreeFile(node)}
          onContextMenu={event => {
            if (!node.isDirectory) {
              event.preventDefault();
              setContextMenu({ x: event.clientX, y: event.clientY, node });
            }
          }}
          title={node.path}
        >
          {node.isDirectory ? <Chevron expanded={expanded} /> : <span className="explorer-chevron-spacer" />}
          {node.isDirectory ? <FolderIcon open={expanded} /> : <FileIcon filename={node.name} />}
          <span className="explorer-name">{node.name}</span>
        </button>
        {node.isDirectory && expanded && (
          <div role="group" className="explorer-children">
            {node.children?.length ? renderNodes(node.children, depth + 1) : (
              <div className="explorer-empty-folder" style={{ paddingLeft: `${38 + depth * 14}px` }}>空文件夹</div>
            )}
          </div>
        )}
      </div>
    );
  });

  if (!sidebarVisible && !outlineVisible) return null;

  const openEditorsExpanded = expandedNodes.has(OPEN_EDITORS_ID);
  const rootExpanded = Boolean(currentFolder && expandedNodes.has(currentFolder));
  const workspaceExpanded = currentFolder ? rootExpanded : true;

  return (
    <aside className="sidebar explorer-sidebar vscode-explorer" style={style}>
      <div className="sidebar-surface">
        <header className="vscode-explorer-header">
          <span>资源管理器</span>
          <div className="vscode-explorer-actions">
            <button onClick={() => { useAppStore.getState().addTab(); setExpandedNodes(previous => new Set(previous).add(OPEN_EDITORS_ID)); }} title="新建文件" aria-label="新建文件">＋</button>
            <button onClick={() => void handleOpenFile()} title="打开文件" aria-label="打开文件"><span className="toolbar-file-icon" /></button>
            <button onClick={() => void handleOpenFolder()} title="打开文件夹" aria-label="打开文件夹"><FolderIcon /></button>
          </div>
        </header>

        <div className="vscode-explorer-tree" role="tree" aria-label="资源管理器">
          <section className="explorer-section">
            <button className="explorer-section-heading" onClick={() => toggleExpanded(OPEN_EDITORS_ID)}>
              <Chevron expanded={openEditorsExpanded} />
              <span>打开的编辑器</span>
              <span className="explorer-count">{tabs.length}</span>
            </button>
            {openEditorsExpanded && (
              <div role="group">
                {tabs.length ? tabs.map(tab => (
                  <button
                    key={tab.id}
                    className={`explorer-row file-row open-editor-row ${tab.id === activeTabId ? 'active' : ''}`}
                    style={{ paddingLeft: 12 }}
                    onClick={() => useAppStore.getState().setActiveTab(tab.id)}
                    title={tab.path || tab.title}
                  >
                    <FileIcon filename={tab.title} />
                    <span className="explorer-name">{tab.title}</span>
                    {tab.modified && <span className="explorer-dirty" title="未保存更改" />}
                    <span
                      className="explorer-close"
                      role="button"
                      aria-label="关闭编辑器"
                      onClick={event => { event.stopPropagation(); useAppStore.getState().closeTab(tab.id); }}
                    >×</span>
                  </button>
                )) : <div className="explorer-empty-state">没有打开的编辑器</div>}
              </div>
            )}
          </section>

          <section className="explorer-section workspace-section">
            <button
              className="explorer-section-heading workspace-heading"
              onClick={() => currentFolder && toggleExpanded(currentFolder)}
              title={currentFolder || '打开文件夹'}
            >
              <Chevron expanded={workspaceExpanded} />
              <span>{currentFolder ? getFolderName(currentFolder) : '无打开的文件夹'}</span>
            </button>
            {currentFolder && rootExpanded && <div role="group" className="explorer-list">{renderNodes(folderTree)}</div>}
            {!currentFolder && (
              <div className="workspace-empty-state">
                <p>尚未打开文件夹。</p>
                <button className="open-workspace-button" onClick={() => void handleOpenFolder()}>打开文件夹</button>
                <p className="workspace-hint">打开文件夹将关闭所有当前打开的编辑器。要使其保持打开状态，请改为添加文件夹。</p>
              </div>
            )}
          </section>

          <section className="explorer-section outline-section">
            <button className="explorer-section-heading" onClick={() => setOutlineVisible(!outlineVisible)}>
              <Chevron expanded={outlineVisible} />
              <span>大纲</span>
              {headings.length > 0 && <span className="explorer-count">{headings.length}</span>}
            </button>
            {outlineVisible && (
              <div role="group" className="outline-explorer-list">
                {headings.length ? headings.map((heading, index) => (
                  <button
                    key={`${heading.line}-${index}`}
                    className="outline-explorer-row"
                    style={{ paddingLeft: `${24 + (heading.level - 1) * 12}px` }}
                    onClick={() => scrollToHeading(heading.line)}
                    title={heading.text}
                  >
                    <span className="outline-level">H{heading.level}</span>
                    <span>{heading.text}</span>
                  </button>
                )) : <div className="explorer-empty-state">当前文档没有标题</div>}
              </div>
            )}
          </section>

          <section className="explorer-section timeline-section">
            <button className="explorer-section-heading" onClick={() => setTimelineExpanded(expanded => !expanded)}>
              <Chevron expanded={timelineExpanded} />
              <span>时间线</span>
              {activeTimeline.length > 0 && <span className="explorer-count">{activeTimeline.length}</span>}
            </button>
            {timelineExpanded && (
              <div role="group" className="timeline-explorer-list">
                {activeTimeline.length ? activeTimeline.map(entry => (
                  <button
                    key={entry.id}
                    className="timeline-explorer-row"
                    onClick={() => activeTabId && restoreTimelineEntry(activeTabId, entry.id)}
                    title="点击回退到此版本"
                  >
                    <span className="timeline-version-icon" aria-hidden="true" />
                    <span className="timeline-entry-text">
                      <strong>{entry.label}</strong>
                      <small>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {entry.content.length} 字符</small>
                    </span>
                  </button>
                )) : <div className="explorer-empty-state">编辑后将在此保留版本记录</div>}
              </div>
            )}
          </section>
        </div>
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }} onClick={event => event.stopPropagation()}>
          <button className="context-menu-item" onClick={() => { void openTreeFile(contextMenu.node); setContextMenu(null); }}>打开文件</button>
        </div>
      )}
    </aside>
  );
}
