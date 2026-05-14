import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface RawFileNode {
  name: string;
  path: string;
  is_directory?: boolean;
  isDirectory?: boolean;
  children?: RawFileNode[];
}

interface SidebarProps {
  style?: React.CSSProperties;
}

type ContextMenuState = {
  x: number;
  y: number;
  path: string;
} | null;

const OPEN_EDITORS_ID = 'virtual:open-editors';

const getFolderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;

const normalizeNode = (node: RawFileNode): FileNode => ({
  name: node.name,
  path: node.path,
  isDirectory: Boolean(node.isDirectory ?? node.is_directory),
  children: node.children?.map(normalizeNode),
});

export function Sidebar({ style }: SidebarProps) {
  const { sidebarVisible, openFile, tabs, activeTabId, currentFile } = useAppStore();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [folderTree, setFolderTree] = useState<FileNode[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([OPEN_EDITORS_ID]));
  const [loadedFolders, setLoadedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const updateRecentFile = useCallback(async (path: string, title: string) => {
    try {
      await invoke('update_recent_file', { path, title });
    } catch (error) {
      console.error('Failed to update recent files:', error);
    }
  }, []);

  const readFolder = useCallback(async (folderPath: string) => {
    const tree = await invoke<RawFileNode[]>('read_folder', { path: folderPath });
    return (tree || []).map(normalizeNode);
  }, []);

  const loadFolderContents = useCallback(async (folderPath: string) => {
    try {
      const tree = await readFolder(folderPath);
      setFolderTree(tree);
      setLoadedFolders(prev => new Set(prev).add(folderPath));
      setExpandedNodes(prev => new Set(prev).add(folderPath));
    } catch (error) {
      console.error('Failed to load folder contents:', error);
      setFolderTree([]);
    }
  }, [readFolder]);

  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.path) {
      queueMicrotask(() => {
        void updateRecentFile(activeTab.path, activeTab.title);
      });
    }
  }, [activeTabId, tabs, updateRecentFile]);

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        filters: [{ name: 'Markdown', extensions: ['md', 'txt', 'markdown'] }],
        multiple: true,
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        for (const path of paths) {
          await openFile(path as string);
        }
        setExpandedNodes(prev => new Set(prev).add(OPEN_EDITORS_ID));
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
    setExpandedNodes(prev => new Set(prev).add(OPEN_EDITORS_ID));
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

  const toggleExpanded = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleFolder = async (node: FileNode) => {
    const isExpanded = expandedNodes.has(node.path);

    if (isExpanded) {
      toggleExpanded(node.path);
      return;
    }

    setExpandedNodes(prev => new Set(prev).add(node.path));

    if (!loadedFolders.has(node.path)) {
      try {
        const children = await readFolder(node.path);
        setFolderTree(currentTree => replaceNodeChildren(currentTree, node.path, children));
        setLoadedFolders(prev => new Set(prev).add(node.path));
      } catch (error) {
        console.error('Failed to load folder children:', error);
      }
    }
  };

  const toggleWorkspaceRoot = async () => {
    if (!currentFolder) return;

    if (expandedNodes.has(currentFolder)) {
      toggleExpanded(currentFolder);
    } else {
      setExpandedNodes(prev => new Set(prev).add(currentFolder));
      if (!loadedFolders.has(currentFolder)) {
        await loadFolderContents(currentFolder);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path });
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    document.addEventListener('click', closeContextMenu);
    return () => document.removeEventListener('click', closeContextMenu);
  }, [closeContextMenu]);

  const getFileIcon = (filename: string) => {
    const lowerName = filename.toLowerCase();
    if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) return 'M';
    if (lowerName.endsWith('.txt')) return 'T';
    if (lowerName.match(/\.(js|ts|jsx|tsx)$/)) return 'TS';
    if (lowerName.match(/\.(json|yaml|yml)$/)) return '{}';
    if (lowerName.match(/\.(html|css)$/)) return '<>';
    return '';
  };

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedNodes.has(node.path);
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
            onContextMenu={(e) => !node.isDirectory && handleContextMenu(e, node.path)}
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

  const openEditorsExpanded = expandedNodes.has(OPEN_EDITORS_ID);
  const rootExpanded = currentFolder ? expandedNodes.has(currentFolder) : false;
  const hasExplorerContent = tabs.length > 0 || Boolean(currentFolder);

  return (
    <aside className="sidebar explorer-sidebar" style={style}>
      <div className="sidebar-header explorer-header">
        <h3>资源管理器</h3>
        <div className="sidebar-actions">
          <button className="sidebar-action-btn" onClick={handleNewFile} title="新建文件" aria-label="新建文件">
            <span className="sidebar-action-icon new-file-icon" aria-hidden="true" />
          </button>
          <button className="sidebar-action-btn" onClick={() => void handleOpenFile()} title="打开文件" aria-label="打开文件">
            <span className="sidebar-action-icon open-file-icon" aria-hidden="true" />
          </button>
          <button className="sidebar-action-btn" onClick={() => void handleOpenFolder()} title="打开文件夹" aria-label="打开文件夹">
            <span className="sidebar-action-icon open-folder-icon" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="explorer-tree" role="tree" aria-label="资源管理器文件树">
        <div className="file-tree open-editors-tree">
          <div className="file-tree-item folder virtual-root" onClick={() => toggleExpanded(OPEN_EDITORS_ID)}>
            <span className="expand-icon">{openEditorsExpanded ? '▾' : '▸'}</span>
            <span className="tree-icon virtual-icon">O</span>
            <span className="tree-name">打开的编辑器</span>
          </div>
          {openEditorsExpanded && (
            tabs.length > 0 ? (
              tabs.map(tab => (
                <div
                  key={tab.id}
                  className={`file-tree-item file open-file-item ${tab.id === activeTabId ? 'active' : ''}`}
                  style={{ paddingLeft: 22 }}
                  onClick={() => useAppStore.getState().setActiveTab(tab.id)}
                  onContextMenu={(e) => tab.path && handleContextMenu(e, tab.path)}
                  onMouseEnter={() => setHoveredItem(tab.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                  title={tab.path || tab.title}
                >
                  <span className="expand-icon" />
                  <span className="tree-icon file-icon-badge">{getFileIcon(tab.title)}</span>
                  <span className="tree-name">{tab.title}</span>
                  {tab.modified && <span className="file-modified">•</span>}
                  {hoveredItem === tab.id && (
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
              ))
            ) : (
              <div className="file-tree-empty" style={{ paddingLeft: 28 }}>
                暂无打开的编辑器
              </div>
            )
          )}
        </div>

        {currentFolder && (
          <div className="file-tree workspace-tree">
            <div className="file-tree-item folder root-folder" onClick={() => void toggleWorkspaceRoot()} title={currentFolder}>
              <span className="expand-icon">{rootExpanded ? '▾' : '▸'}</span>
              <span className="tree-icon folder-icon" />
              <span className="tree-name">{getFolderName(currentFolder)}</span>
            </div>
            {rootExpanded && renderFileTree(folderTree, 1)}
          </div>
        )}

        {!hasExplorerContent && (
          <div className="explorer-empty">
            <span>尚未打开文件夹</span>
            <small>使用顶部按钮打开文件或文件夹，内容会显示在资源管理器中。</small>
            <button className="open-folder-primary" onClick={() => void handleOpenFolder()}>
              打开文件夹
            </button>
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => void openFile(contextMenu.path)}>
            打开文件
          </div>
        </div>
      )}
    </aside>
  );
}
