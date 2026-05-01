import { useState, useEffect } from 'react';
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
  expanded?: boolean;
}

interface SidebarProps {
  style?: React.CSSProperties;
}

export function Sidebar({ style }: SidebarProps) {
  const { sidebarVisible, openFile, tabs, activeTabId } = useAppStore();
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);
  const [folderTree, setFolderTree] = useState<FileNode[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; type: 'recent' | 'tree' } | null>(null);

  useEffect(() => {
    loadRecentFiles();
  }, []);

  useEffect(() => {
    if (tabs.length > 0) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab?.path) {
        updateRecentFiles(activeTab.path, activeTab.title);
      }
    }
  }, [activeTabId, tabs]);

  const loadRecentFiles = async () => {
    try {
      const files = await invoke<RecentFile[]>('get_recent_files');
      setRecentFiles(files || []);
    } catch (error) {
      console.error('Failed to load recent files:', error);
      setRecentFiles([]);
    }
  };

  const updateRecentFiles = async (path: string, title: string) => {
    try {
      const updated = await invoke<RecentFile[]>('update_recent_file', { path, title });
      setRecentFiles(updated || []);
    } catch (error) {
      console.error('Failed to update recent files:', error);
    }
  };

  const handleFileClick = (path: string) => {
    openFile(path);
  };

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        filters: [{ name: 'Markdown', extensions: ['md', 'txt', 'markdown'] }],
        multiple: false,
      });
      if (selected) {
        openFile(selected as string);
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

  const loadFolderContents = async (folderPath: string) => {
    try {
      const tree = await invoke<FileNode[]>('read_folder', { path: folderPath });
      setFolderTree(tree || []);
    } catch (error) {
      console.error('Failed to load folder contents:', error);
      setFolderTree([]);
    }
  };

  const toggleFolder = async (node: FileNode) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path);
    } else {
      newExpanded.add(node.path);
      // Load children if not loaded
      if (!node.children) {
        try {
          const children = await invoke<FileNode[]>('read_folder', { path: node.path });
          node.children = children || [];
        } catch (error) {
          console.error('Failed to load folder children:', error);
        }
      }
    }
    setExpandedFolders(newExpanded);
  };

  const handleNewFile = () => {
    useAppStore.getState().addTab();
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

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleRemoveFromList = async () => {
    if (contextMenu) {
      await removeRecentFile(contextMenu.path);
      closeContextMenu();
    }
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const formatTime = (timestamp: number) => {
    const now = Date.now();
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

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => (
      <div key={node.path}>
        <div
          className={`file-tree-item ${node.isDirectory ? 'folder' : 'file'}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => {
            if (node.isDirectory) {
              toggleFolder(node);
            } else {
              handleFileClick(node.path);
            }
          }}
          onContextMenu={(e) => !node.isDirectory && handleContextMenu(e, node.path, 'tree')}
        >
          {node.isDirectory && (
            <span className="expand-icon">
              {expandedFolders.has(node.path) ? '▼' : '▶'}
            </span>
          )}
          <span className="tree-icon">{node.isDirectory ? '📁' : getFileIcon(node.name)}</span>
          <span className="tree-name">{node.name}</span>
        </div>
        {node.isDirectory && expandedFolders.has(node.path) && node.children && (
          <div className="file-tree-children">
            {renderFileTree(node.children, depth + 1)}
          </div>
        )}
      </div>
    ));
  };

  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.md')) return '📝';
    if (filename.endsWith('.txt')) return '📄';
    if (filename.match(/\.(js|ts|jsx|tsx)$/)) return '📜';
    if (filename.match(/\.(json|yaml|yml)$/)) return '⚙️';
    if (filename.match(/\.(html|css)$/)) return '🌐';
    return '📃';
  };

  if (!sidebarVisible) return null;

  return (
    <aside className="sidebar" style={style}>
      <div className="sidebar-header">
        <h3>文件管理</h3>
        <div className="sidebar-actions">
          <button
            className="sidebar-action-btn"
            onClick={handleNewFile}
            title="新建文件"
          >
            +
          </button>
          <button
            className="sidebar-action-btn"
            onClick={handleOpenFile}
            title="打开文件"
          >
            📄
          </button>
          <button
            className="sidebar-action-btn"
            onClick={handleOpenFolder}
            title="打开文件夹"
          >
            📂
          </button>
        </div>
      </div>

      {currentFolder && (
        <div className="sidebar-section folder-section">
          <div className="sidebar-section-title">
            <span>📁 {currentFolder.split(/[\\/]/).pop()}</span>
          </div>
          <div className="file-tree">
            {renderFileTree(folderTree)}
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>当前打开</span>
        </div>
        <div className="sidebar-files">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`sidebar-file ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => useAppStore.getState().setActiveTab(tab.id)}
              onMouseEnter={() => setHoveredFile(tab.id)}
              onMouseLeave={() => setHoveredFile(null)}
            >
              <span className="file-icon">📄</span>
              <span className="file-name">{tab.title}</span>
              {tab.modified && <span className="file-modified">●</span>}
              {hoveredFile === tab.id && !tab.path && (
                <button
                  className="file-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    useAppStore.getState().closeTab(tab.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {recentFiles.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">
            <span>最近文档</span>
          </div>
          <div className="sidebar-files">
            {recentFiles.map(file => (
              <div
                key={file.path}
                className="sidebar-file"
                onClick={() => handleFileClick(file.path)}
                onContextMenu={(e) => handleContextMenu(e, file.path, 'recent')}
                onMouseEnter={() => setHoveredFile(file.path)}
                onMouseLeave={() => setHoveredFile(null)}
              >
                <span className="file-icon">📝</span>
                <span className="file-name">{file.title}</span>
                <span className="file-time">{formatTime(file.last_opened)}</span>
                {hoveredFile === file.path && (
                  <button
                    className="file-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecentFile(file.path);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="context-menu-item"
            onClick={() => handleFileClick(contextMenu.path)}
          >
            打开文件
          </div>
          <div className="context-menu-divider" />
          <div
            className="context-menu-item danger"
            onClick={handleRemoveFromList}
          >
            从列表中移除
          </div>
        </div>
      )}
    </aside>
  );
}
