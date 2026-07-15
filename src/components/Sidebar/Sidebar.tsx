import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore, type TimelineEntry } from '../../stores/appStore';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  file?: File;
  directoryHandle?: FileSystemDirectoryHandle;
}

interface WorkspaceFolder {
  name: string;
  path: string;
  tree: FileNode[];
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
  view?: 'explorer' | 'search';
}

type ContextMenuState = { x: number; y: number; node: FileNode } | null;
type TimelineHoverState = { entry: TimelineEntry; x: number; y: number } | null;
type TimelineDialogState = { entry: TimelineEntry; mode: 'preview' | 'diff' } | null;
type TimelineDiffLine = { kind: 'same' | 'added' | 'removed' | 'collapsed'; text: string };

const OPEN_EDITORS_ID = 'virtual:open-editors';
const isTauriRuntime = () => '__TAURI_INTERNALS__' in window;
const isDirectOpenFile = (name: string) => /\.(md|markdown|txt)$/i.test(name);

const splitTimelineLines = (value: string) => value.split(/\r?\n/);

const buildTimelineDiff = (versionContent: string, currentContent: string): TimelineDiffLine[] => {
  const previous = splitTimelineLines(versionContent);
  const current = splitTimelineLines(currentContent);
  let prefix = 0;
  while (prefix < previous.length && prefix < current.length && previous[prefix] === current[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < previous.length - prefix
    && suffix < current.length - prefix
    && previous[previous.length - 1 - suffix] === current[current.length - 1 - suffix]
  ) suffix += 1;

  const lines: TimelineDiffLine[] = [];
  const context = 3;
  if (prefix > context) lines.push({ kind: 'collapsed', text: `… 前方 ${prefix - context} 行未变化 …` });
  for (let index = Math.max(0, prefix - context); index < prefix; index += 1) {
    lines.push({ kind: 'same', text: previous[index] });
  }

  const previousChanged = previous.slice(prefix, previous.length - suffix);
  const currentChanged = current.slice(prefix, current.length - suffix);
  if (previousChanged.length * currentChanged.length > 40000) {
    previousChanged.forEach(text => lines.push({ kind: 'removed', text }));
    currentChanged.forEach(text => lines.push({ kind: 'added', text }));
  } else {
    const table = Array.from({ length: previousChanged.length + 1 }, () => new Uint16Array(currentChanged.length + 1));
    for (let previousIndex = previousChanged.length - 1; previousIndex >= 0; previousIndex -= 1) {
      for (let currentIndex = currentChanged.length - 1; currentIndex >= 0; currentIndex -= 1) {
        table[previousIndex][currentIndex] = previousChanged[previousIndex] === currentChanged[currentIndex]
          ? table[previousIndex + 1][currentIndex + 1] + 1
          : Math.max(table[previousIndex + 1][currentIndex], table[previousIndex][currentIndex + 1]);
      }
    }
    let previousIndex = 0;
    let currentIndex = 0;
    while (previousIndex < previousChanged.length || currentIndex < currentChanged.length) {
      if (previousIndex < previousChanged.length && currentIndex < currentChanged.length && previousChanged[previousIndex] === currentChanged[currentIndex]) {
        lines.push({ kind: 'same', text: previousChanged[previousIndex] });
        previousIndex += 1;
        currentIndex += 1;
      } else if (currentIndex < currentChanged.length && (previousIndex === previousChanged.length || table[previousIndex][currentIndex + 1] >= table[previousIndex + 1][currentIndex])) {
        lines.push({ kind: 'added', text: currentChanged[currentIndex] });
        currentIndex += 1;
      } else {
        lines.push({ kind: 'removed', text: previousChanged[previousIndex] });
        previousIndex += 1;
      }
    }
  }

  for (let index = previous.length - suffix; index < Math.min(previous.length, previous.length - suffix + context); index += 1) {
    lines.push({ kind: 'same', text: previous[index] });
  }
  if (suffix > context) lines.push({ kind: 'collapsed', text: `… 后方 ${suffix - context} 行未变化 …` });
  return lines;
};

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

function ExplorerActionIcon({ type }: { type: 'newFile' | 'openFile' | 'openFolder' }) {
  if (type === 'newFile') {
    return <svg className="explorer-action-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  }
  if (type === 'openFile') {
    return <svg className="explorer-action-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.8h5l3 3v9.4H4zM9 1.8v3.3h3M6 8h4M6 10.5h4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return (
    <svg className="explorer-action-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.75 4.25h4.1l1.4 1.5h7v6.5H1.75z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon({ filename }: { filename: string }) {
  const extension = filename.split('.').pop()?.toLowerCase();
  const kind = extension === 'md' || extension === 'markdown' ? 'markdown'
    : extension === 'txt' ? 'text'
      : extension === 'json' ? 'json'
        : 'document';
  return <span className={`explorer-icon file-icon ${kind}`} aria-hidden="true">{kind === 'markdown' ? 'M' : ''}</span>;
}

function SearchSidebar({ style }: SidebarProps) {
  const { tabs, activeTabId, setActiveTab } = useAppStore();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return tabs.flatMap((tab) => tab.content.split('\n').flatMap((line, index) => {
      const column = line.toLocaleLowerCase().indexOf(normalizedQuery);
      return column < 0 ? [] : [{ tabId: tab.id, title: tab.title, lineNumber: index + 1, column, line }];
    })).slice(0, 100);
  }, [normalizedQuery, tabs]);

  const openResult = (result: typeof results[number]) => {
    setActiveTab(result.tabId);
    window.setTimeout(() => {
      const view = useAppStore.getState().editorView;
      if (!view) return;
      const line = view.state.doc.line(Math.min(result.lineNumber, view.state.doc.lines));
      const position = Math.min(line.to + result.column, view.state.doc.length);
      view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
      view.focus();
    }, 0);
  };

  return (
    <aside className="sidebar search-sidebar" style={style}>
      <div className="sidebar-surface">
        <header className="vscode-explorer-header"><span>搜索</span></header>
        <div className="document-search-panel">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索已打开的文件"
            aria-label="搜索已打开的文件"
            autoFocus
          />
          {normalizedQuery ? (
            <div className="document-search-results" role="list">
              <div className="document-search-count">找到 {results.length}{results.length === 100 ? '+' : ''} 项</div>
              {results.map((result) => (
                <button key={`${result.tabId}-${result.lineNumber}-${result.column}`} className={`document-search-result ${result.tabId === activeTabId ? 'active' : ''}`} onClick={() => openResult(result)} role="listitem">
                  <strong>{result.title}</strong>
                  <small>第 {result.lineNumber} 行</small>
                  <span>{result.line || '空行'}</span>
                </button>
              ))}
              {!results.length && <div className="explorer-empty-state">没有匹配结果</div>}
            </div>
          ) : <div className="document-search-empty">输入关键词，可在所有已打开文件中搜索。</div>}
        </div>
      </div>
    </aside>
  );
}

export function Sidebar({ style, view = 'explorer' }: SidebarProps) {
  return view === 'search' ? <SearchSidebar style={style} /> : <ExplorerSidebar style={style} />;
}

function ExplorerSidebar({ style }: SidebarProps) {
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
    deleteTimelineEntry,
    cleanupTimeline,
  } = useAppStore();
  const [workspaceFolders, setWorkspaceFolders] = useState<WorkspaceFolder[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([OPEN_EDITORS_ID]));
  const [loadedFolders, setLoadedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [timelineHover, setTimelineHover] = useState<TimelineHoverState>(null);
  const [timelineDialog, setTimelineDialog] = useState<TimelineDialogState>(null);
  const headings = useMemo(() => parseHeadings(content), [content]);
  const activeTimeline = activeTabId ? timeline[activeTabId] || [] : [];
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  useEffect(() => {
    cleanupTimeline();
  }, [cleanupTimeline]);

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

  const addWorkspaceFolder = useCallback(async (folderPath: string, browserHandle?: FileSystemDirectoryHandle) => {
    if (workspaceFolders.some((folder) => folder.path === folderPath)) {
      setExpandedNodes(previous => new Set(previous).add(folderPath));
      return;
    }
    try {
      const tree = browserHandle
        ? await readBrowserFolder(browserHandle, folderPath)
        : await readFolder(folderPath);
      setWorkspaceFolders(previous => previous.some((folder) => folder.path === folderPath)
        ? previous
        : [...previous, { name: browserHandle?.name || getFolderName(folderPath), path: folderPath, tree }]);
      setLoadedFolders(previous => new Set(previous).add(folderPath));
      setExpandedNodes(previous => new Set(previous).add(folderPath));
    } catch (error) {
      console.error('Failed to load folder contents:', error);
    }
  }, [readBrowserFolder, readFolder, workspaceFolders]);

  useEffect(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    if (!activeTab?.path) return;
    void invoke('update_recent_file', { path: activeTab.path, title: activeTab.title }).catch(() => undefined);
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (!currentFile || currentFile.startsWith('web://')) return;
    const parent = currentFile.replace(/[\\/][^\\/]+$/, '');
    if (parent && !workspaceFolders.some((folder) => folder.path === parent)) {
      queueMicrotask(() => {
        void addWorkspaceFolder(parent);
      });
    }
  }, [addWorkspaceFolder, currentFile, workspaceFolders]);

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
      setWorkspaceFolders(previous => previous.map((folder) => ({
        ...folder,
        tree: replaceNodeChildren(folder.tree, node.path, children),
      })));
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
        await addWorkspaceFolder(path, handle);
        return;
      }
      const selected = await open({ directory: true, multiple: true });
      if (selected) {
        for (const folderPath of (Array.isArray(selected) ? selected : [selected])) {
          await addWorkspaceFolder(folderPath as string);
        }
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

  return (
    <aside className="sidebar explorer-sidebar vscode-explorer" style={style}>
      <div className="sidebar-surface">
        <header className="vscode-explorer-header">
          <span>资源管理器</span>
          <div className="vscode-explorer-actions">
            <button onClick={() => { useAppStore.getState().addTab(); setExpandedNodes(previous => new Set(previous).add(OPEN_EDITORS_ID)); }} title="新建文件" aria-label="新建文件"><ExplorerActionIcon type="newFile" /></button>
            <button onClick={() => void handleOpenFile()} title="打开文件" aria-label="打开文件"><ExplorerActionIcon type="openFile" /></button>
            <button onClick={() => void handleOpenFolder()} title="打开文件夹" aria-label="打开文件夹"><ExplorerActionIcon type="openFolder" /></button>
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
                    <span className="explorer-chevron-spacer" aria-hidden="true" />
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
            {workspaceFolders.length ? workspaceFolders.map((folder) => {
              const expanded = expandedNodes.has(folder.path);
              return (
                <div key={folder.path} className="workspace-folder-root" role="treeitem" aria-expanded={expanded}>
                  <button
                    className="explorer-section-heading workspace-heading"
                    onClick={() => toggleExpanded(folder.path)}
                    title={folder.path}
                  >
                    <Chevron expanded={expanded} />
                    <FolderIcon open={expanded} />
                    <span className="explorer-name">{folder.name}</span>
                  </button>
                  {expanded && <div role="group" className="explorer-list">{renderNodes(folder.tree)}</div>}
                </div>
              );
            }) : (
              <>
                <div className="explorer-section-heading workspace-heading" role="heading" aria-level={2}>
                  <Chevron expanded />
                  <span>无打开的文件夹</span>
                </div>
                <div className="workspace-empty-state">
                  <p>尚未打开文件夹。</p>
                  <button className="open-workspace-button" onClick={() => void handleOpenFolder()}>打开文件夹</button>
                  <p className="workspace-hint">可一次选择多个文件夹，也可再次点击文件夹按钮继续添加。</p>
                </div>
              </>
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
              {activeTab && <span className="timeline-file-name">{activeTab.title}</span>}
              {activeTimeline.length > 0 && <span className="explorer-count">{activeTimeline.length}</span>}
            </button>
            {timelineExpanded && (
              <div role="group" className="timeline-explorer-list">
                {activeTimeline.length ? activeTimeline.map(entry => (
                  <div
                    key={entry.id}
                    className="timeline-explorer-row"
                    onClick={() => setTimelineDialog({ entry, mode: 'preview' })}
                    onMouseEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setTimelineHover({
                        entry,
                        x: Math.min(rect.right + 8, window.innerWidth - 350),
                        y: Math.min(rect.top, window.innerHeight - 220),
                      });
                    }}
                    onMouseLeave={() => setTimelineHover(null)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setTimelineDialog({ entry, mode: 'preview' });
                      }
                    }}
                    aria-label={`${entry.operation || entry.label}，打开版本详情`}
                  >
                    <span className="timeline-version-icon" aria-hidden="true" />
                    <span className="timeline-entry-text">
                      <strong>{entry.label}</strong>
                      <small>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {entry.content.length} 字符</small>
                    </span>
                    <span className="timeline-row-actions" aria-label="版本操作">
                      <button onClick={(event) => { event.stopPropagation(); setTimelineDialog({ entry, mode: 'diff' }); }} title="与当前内容对比" aria-label="与当前内容对比">≠</button>
                      <button onClick={(event) => { event.stopPropagation(); if (activeTabId) restoreTimelineEntry(activeTabId, entry.id); }} title="恢复此版本" aria-label="恢复此版本">↶</button>
                      <button onClick={(event) => { event.stopPropagation(); if (activeTabId) deleteTimelineEntry(activeTabId, entry.id); }} title="删除此记录" aria-label="删除此记录">×</button>
                    </span>
                  </div>
                )) : <div className="explorer-empty-state">编辑后将在此保留版本记录</div>}
              </div>
            )}
          </section>
        </div>
      </div>

      {timelineHover && (
        <div className="timeline-operation-popover" role="tooltip" style={{ left: timelineHover.x, top: timelineHover.y }}>
          <div className="timeline-popover-heading">本地编辑</div>
          <div className="timeline-popover-time">
            {new Date(timelineHover.entry.timestamp).toLocaleString()} · {timelineHover.entry.content.length} 字符
          </div>
          <div className="timeline-popover-operation">{timelineHover.entry.operation || timelineHover.entry.label}</div>
          <div className="timeline-popover-hint">点击查看版本；可预览、对比、恢复或删除。</div>
        </div>
      )}

      {timelineDialog && activeTabId && (
        <div className="timeline-version-overlay" role="presentation" onMouseDown={() => setTimelineDialog(null)}>
          <section className="timeline-version-dialog" role="dialog" aria-modal="true" aria-label="历史版本详情" onMouseDown={(event) => event.stopPropagation()}>
            <header className="timeline-version-dialog-header">
              <div>
                <strong>历史版本</strong>
                <small>{new Date(timelineDialog.entry.timestamp).toLocaleString()} · {timelineDialog.entry.content.length} 字符</small>
              </div>
              <button onClick={() => setTimelineDialog(null)} title="关闭" aria-label="关闭">×</button>
            </header>
            <div className="timeline-version-operation">{timelineDialog.entry.operation || timelineDialog.entry.label}</div>
            <div className="timeline-version-tabs">
              <button className={timelineDialog.mode === 'preview' ? 'active' : ''} onClick={() => setTimelineDialog(dialog => dialog ? { ...dialog, mode: 'preview' } : dialog)}>版本预览</button>
              <button className={timelineDialog.mode === 'diff' ? 'active' : ''} onClick={() => setTimelineDialog(dialog => dialog ? { ...dialog, mode: 'diff' } : dialog)}>与当前对比</button>
            </div>
            {timelineDialog.mode === 'preview' ? (
              <pre className="timeline-version-content">{timelineDialog.entry.content || '（空文档）'}</pre>
            ) : (
              <div className="timeline-diff-content" aria-label="当前内容差异">
                {buildTimelineDiff(timelineDialog.entry.content, activeTab?.content ?? content).map((line, index) => (
                  <div key={`${line.kind}-${index}`} className={`timeline-diff-line ${line.kind}`}>
                    <span>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : line.kind === 'collapsed' ? '…' : ' '}</span>
                    <code>{line.text || ' '}</code>
                  </div>
                ))}
              </div>
            )}
            <footer className="timeline-version-actions">
              <button className="timeline-delete-action" onClick={() => { deleteTimelineEntry(activeTabId, timelineDialog.entry.id); setTimelineDialog(null); }}>删除记录</button>
              <span />
              <button onClick={() => setTimelineDialog(null)}>取消</button>
              <button className="timeline-restore-action" onClick={() => { restoreTimelineEntry(activeTabId, timelineDialog.entry.id); setTimelineDialog(null); }}>恢复此版本</button>
            </footer>
          </section>
        </div>
      )}

      {contextMenu && (
        <div className="context-menu" style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }} onClick={event => event.stopPropagation()}>
          <button className="context-menu-item" onClick={() => { void openTreeFile(contextMenu.node); setContextMenu(null); }}>打开文件</button>
        </div>
      )}
    </aside>
  );
}
