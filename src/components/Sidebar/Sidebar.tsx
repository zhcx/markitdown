import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface RecentFile {
  path: string;
  title: string;
  last_opened: number;
}

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface SidebarProps {
  style?: React.CSSProperties;
}

type ContextMenuState = {
  x: number;
  y: number;
  path: string;
  type: 'recent' | 'tree';
} | null;

const getFolderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;

export function Sidebar({ style }: SidebarProps) {
  const { sidebarVisible, openFile, tabs, activeTabId, currentFile } = useAppStore();
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);
  const [folderTree, setFolderTree] = useState<FileNode[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loadedFolders, setLoadedFolders] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [now, setNow] = useState(0);

  const loadRecentFiles = useCallback(async () => {
    try {
      const files = await invoke<RecentFile[]>('get_recent_files');
      setRecentFiles(files || []);
    } catch (error) {
      console.error('Failed to load recent files:', error);
      setRecentFiles([]);
    }
  }, []);

  const updateRecentFiles = useCallback(async (path: string, title: string) => {
    try {
      const updated = await invoke<RecentFile[]>('update_recent_file', { path, title });
      setRecentFiles(updated || []);
    } catch (error) {
      console.error('Failed to update recent files:', error);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadRecentFiles();
    });
  }, [loadRecentFiles]);

  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.path) {
      queueMicrotask(() => {
        void updateRecentFiles(activeTab.path, activeTab.title);
      });
    }
  }, [activeTabId, tabs, updateRecentFiles]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  const loadFolderContents = useCallback(async (folderPath: string) => {
    try {
      const tree = await invoke<FileNode[]>('read_folder', { path: folderPath });
      setFolderTree(tree || []);
      setLoadedFolders(prev => new Set(prev).add(folderPath));
      setExpandedFolders(prev => new Set(prev).add(folderPath));
    } catch (error) {
      console.error('Failed to load folder contents:', error);
      setFolderTree([]);
    }
  }, []);

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        filters: [{ name: 'Markdown', extensions: ['md', 'txt', 'markdown'] }],
        multiple: false,
      });
      if (selected) {
        void openFile(selected as string);
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        const folderPath = selected as string;
        setCurrentFolder(folderPath);
        await loadFolderContents(folderPath);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  const handleNewFile = () => {
    useAppStore.getState().addTab();
  };

  const replaceNodeChildren = (nodes: FileNode[], path: string, children: FileNode[]): FileNode[] =>
    nodes.map(node => {
      if (node.path === path) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: replaceNodeChildren(node.children, path, children) };
      }
      return node;
    });

  const toggleFolder = async (node: FileNode) => {
    const isExpanded = expandedFolders.has(node.path);

    if (isExpanded) {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
      return;
    }

    setExpandedFolders(prev => new Set(prev).add(node.path));

    if (!loadedFolders.has(node.path)) {
      try {
        const children = await invoke<FileNode[]>('read_folder', { path: node.path });
        setFolderTree(currentTree => replaceNodeChildren(currentTree, node.path, children || []));
        setLoadedFolders(prev => new Set(prev).add(node.path));
      } catch (error) {
        console.error('Failed to load folder children:', error);
      }
    }
  };

  const toggleWorkspaceRoot = async () => {
    if (!currentFolder) return;

    if (expandedFolders.has(currentFolder)) {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        next.delete(currentFolder);
        return next;
      });
    } else {
      setExpandedFolders(prev => new Set(prev).add(currentFolder));
      if (!loadedFolders.has(currentFolder)) {
        await loadFolderContents(currentFolder);
      }
    }
  };

  const removeRecentFile = async (path: string) => {
    try {
      const updated = await invoke<RecentFile[]>('remove_recent_file', { path });
      setRecentFiles(updated || []);
    } catch (error) {
      console.error('Failed to remove recent file:', error);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, path: string, type: 'recent' | 'tree') => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, type });
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleRemoveFromList = async () => {
    if (contextMenu) {
      await removeRecentFile(contextMenu.path);
      closeContextMenu();
    }
  };

  useEffect(() => {
    document.addEventListener('click', closeContextMenu);
    return () => document.removeEventListener('click', closeContextMenu);
  }, [closeContextMenu]);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const formatTime = (timestamp: number) => {
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.md') || filename.endsWith('.markdown')) return 'M';
    if (filename.endsWith('.txt')) return 'T';
    if (filename.match(/\.(js|ts|jsx|tsx)$/)) return 'JS';
    if (filename.match(/\.(json|yaml|yml)$/)) return '{}';
    if (filename.match(/\.(html|css)$/)) return '<>';
    return '•';
  };

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedFolders.has(node.path);
      const isActive = currentFile === node.path;

      return (
        <div key={node.path} className="file-tree-row-wrap">
          <div
            className={`file-tree-item ${node.isDirectory ? 'folder' : 'file'} ${isActive ? 'active' : ''}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            onClick={() => {
              if (node.isDirectory) {
                void toggleFolder(node);
              } else {
                void openFile(node.path);
              }
            }}
            onContextMenu={(e) => !node.isDirectory && handleContextMenu(e, node.path, 'tree')}
            title={node.path}
          >
            <span className="expand-icon">{node.isDirectory ? (isExpanded ? '▾' : '▸') : ''}</span>
            <span className={`tree-icon ${node.isDirectory ? 'folder-icon' : 'file-icon-badge'}`}>
              {node.isDirectory ? '' : getFileIcon(node.name)}
            </span>
            <span className="tree-name">{node.name}</span>
          </div>
          {node.isDirectory && isExpanded && (
            <div className="file-tree-children">
              {node.children && node.children.length > 0 ? (
                renderFileTree(node.children, depth + 1)
              ) : (
                <div className="file-tree-empty" style={{ paddingLeft: `${28 + (depth + 1) * 14}px` }}>
                  空文件夹
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  if (!sidebarVisible) return null;

  const openEditorsCollapsed = collapsedSections.has('open-editors');
  const workspaceCollapsed = collapsedSections.has('workspace');
  const recentCollapsed = collapsedSections.has('recent');
  const rootExpanded = currentFolder ? expandedFolders.has(currentFolder) : false;

  return (
    <aside className="sidebar explorer-sidebar" style={style}>
      <div className="sidebar-header explorer-header">
        <h3>资源浏览器</h3>
        <div className="sidebar-actions">
          <button className="sidebar-action-btn" onClick={handleNewFile} title="新建文件" aria-label="新建文件">
            <span className="sidebar-action-icon new-file-icon" aria-hidden="true" />
          </button>
          <button className="sidebar-action-btn" onClick={handleOpenFile} title="打开文件" aria-label="打开文件">
            <span className="sidebar-action-icon open-file-icon" aria-hidden="true" />
          </button>
          <button className="sidebar-action-btn" onClick={handleOpenFolder} title="打开文件夹" aria-label="打开文件夹">
            <span className="sidebar-action-icon open-folder-icon" aria-hidden="true" />
          </button>
        </div>
      </div>

      <section className="sidebar-section explorer-section">
        <button className="sidebar-section-title explorer-section-title" onClick={() => toggleSection('open-editors')}>
          <span className="section-caret">{openEditorsCollapsed ? '▸' : '▾'}</span>
          <span>当前打开</span>
        </button>
        {!openEditorsCollapsed && (
          <div className="sidebar-files explorer-list">
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`sidebar-file explorer-file ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => useAppStore.getState().setActiveTab(tab.id)}
                onMouseEnter={() => setHoveredFile(tab.id)}
                onMouseLeave={() => setHoveredFile(null)}
                title={tab.path || tab.title}
              >
                <span className="file-icon-badge">{getFileIcon(tab.title)}</span>
                <span className="file-name">{tab.title}</span>
                {tab.modified && <span className="file-modified">●</span>}
                {hoveredFile === tab.id && (
                  <button
                    className="file-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      useAppStore.getState().closeTab(tab.id);
                    }}
                    title="关闭"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sidebar-section explorer-section folder-section">
        <button className="sidebar-section-title explorer-section-title" onClick={() => toggleSection('workspace')}>
          <span className="section-caret">{workspaceCollapsed ? '▸' : '▾'}</span>
          <span>文件夹</span>
        </button>
        {!workspaceCollapsed && (
          currentFolder ? (
            <div className="file-tree">
              <div className="file-tree-item folder root-folder" onClick={() => void toggleWorkspaceRoot()} title={currentFolder}>
                <span className="expand-icon">{rootExpanded ? '▾' : '▸'}</span>
                <span className="tree-icon folder-icon" />
                <span className="tree-name">{getFolderName(currentFolder)}</span>
              </div>
              {rootExpanded && renderFileTree(folderTree, 1)}
            </div>
          ) : (
            <div className="explorer-empty">
              <span>未打开文件夹</span>
              <small>点击顶部文件夹按钮选择工作目录</small>
            </div>
          )
        )}
      </section>

      {recentFiles.length > 0 && (
        <section className="sidebar-section explorer-section recent-section">
          <button className="sidebar-section-title explorer-section-title" onClick={() => toggleSection('recent')}>
            <span className="section-caret">{recentCollapsed ? '▸' : '▾'}</span>
            <span>最近文档</span>
          </button>
          {!recentCollapsed && (
            <div className="sidebar-files explorer-list">
              {recentFiles.map(file => (
                <div
                  key={file.path}
                  className="sidebar-file explorer-file recent-file"
                  onClick={() => void openFile(file.path)}
                  onContextMenu={(e) => handleContextMenu(e, file.path, 'recent')}
                  onMouseEnter={() => setHoveredFile(file.path)}
                  onMouseLeave={() => setHoveredFile(null)}
                  title={file.path}
                >
                  <span className="file-icon-badge">{getFileIcon(file.title)}</span>
                  <span className="file-name">{file.title}</span>
                  <span className="file-time">{formatTime(file.last_opened)}</span>
                  {hoveredFile === file.path && (
                    <button
                      className="file-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeRecentFile(file.path);
                      }}
                      title="移除"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {contextMenu && (
        <div
          className="context-menu"
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => void openFile(contextMenu.path)}>
            打开文件
          </div>
          {contextMenu.type === 'recent' && (
            <>
              <div className="context-menu-divider" />
              <div className="context-menu-item danger" onClick={handleRemoveFromList}>
                从列表中移除
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
