import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { open as openDialog, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { PdfExportDialog } from '../Export/PdfExportDialog';

interface MenuItem {
  label: string;
  action?: () => void;
  shortcut?: string;
  divider?: boolean;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

interface UpdateInfo {
  has_update: boolean;
  current_version: string;
  latest_version: string;
  download_url: string;
  asset_download_url: string;
  asset_name: string;
  asset_size: number;
  release_notes: string;
  published_at: string;
}

interface DownloadProgress {
  downloaded: number;
  total: number;
  progress: number;
}

interface HelpModalProps {
  type: 'shortcuts' | 'syntax' | 'about' | 'update';
  updateInfo?: UpdateInfo | null;
  downloadProgress?: DownloadProgress | null;
  downloadDone?: boolean;
  onDownloadAndInstall?: () => void;
  onClose: () => void;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight: (str: string, lang: string) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="hljs"><code>' + hljs.highlight(str, { language: lang, ignoreIllegals: true }).value + '</code></pre>';
      } catch {
        // Fall back to escaped code below.
      }
    }
    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
  },
});

function HelpModal({ type, updateInfo, downloadProgress, downloadDone, onDownloadAndInstall, onClose }: HelpModalProps) {
  const content = {
    shortcuts: {
      title: '快捷键说明',
      body: `
**文件操作**
- Ctrl+N - 新建文件
- Ctrl+O - 打开文件
- Ctrl+S - 保存文件
- Ctrl+Shift+S - 另存为

**编辑操作**
- Ctrl+Z - 撤销
- Ctrl+Y - 重做
- Ctrl+X - 剪切
- Ctrl+C - 复制
- Ctrl+V - 粘贴
- Ctrl+A - 全选

**格式化**
- Ctrl+B - 加粗
- Ctrl+I - 斜体
- Ctrl+K - 插入链接

**视图**
- F11 - 全屏切换
      `
    },
    syntax: {
      title: 'Markdown 语法说明',
      body: `
**标题**
# 一级标题
## 二级标题
### 三级标题

**文本样式**
**粗体** 或 __粗体__
*斜体* 或 _斜体_
~~删除线~~

**列表**
- 无序列表项
1. 有序列表项

**链接和图片**
[链接文本](URL)
![图片描述](URL)

**代码**
行内代码: \`code\`

代码块:
\`\`\`
code block
\`\`\`

**引用**
> 引用内容

**数学公式**
行内: $E=mc^2$
块: $$E=mc^2$$

**Mermaid 图表**
\`\`\`mermaid
graph TD
  A --> B
\`\`\`
      `
    },
    about: {
      title: '关于 MarkitDown',
      body: `
**MarkitDown v0.1.4**

一款现代化的 Markdown 编辑器

**功能特点**
- 实时预览
- 多标签页编辑
- 支持数学公式
- 支持 Mermaid 图表
- 多种图床支持
- 深色/浅色主题
- AI智能助手

**技术栈**
Tauri 2.0 + React + TypeScript

**开发者**
[七月](https://github.com/zhcx)

**项目地址**
https://github.com/zhcx/markitdown
      `
    },
    update: {
      title: '检查更新',
      body: ''
    }
  };

  const { title } = content[type];

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {type === 'update' ? (
            updateInfo ? (
              <div className="update-modal-content">
                {updateInfo.has_update ? (
                  <>
                    <div className="update-badge new">发现新版本</div>
                    <div className="update-version-info">
                      <p>当前版本: <span className="version-old">v{updateInfo.current_version}</span></p>
                      <p>最新版本: <span className="version-new">v{updateInfo.latest_version}</span></p>
                      <p className="update-date">发布日期: {formatDate(updateInfo.published_at)}</p>
                    </div>
                    <div className="update-notes">
                      <h4>更新内容</h4>
                      <div
                        className="update-notes-content"
                        dangerouslySetInnerHTML={{ __html: md.render(updateInfo.release_notes || '暂无更新说明') }}
                      />
                    </div>
                    {downloadProgress ? (
                      <div className="update-download-progress">
                        <div className="update-progress-bar">
                          <div
                            className="update-progress-fill"
                            style={{ width: `${downloadProgress!.progress}%` }}
                          />
                        </div>
                        <p className="update-progress-text">
                          {downloadDone
                            ? '下载完成，启动安装程序…'
                            : `正在下载 ${formatSize(downloadProgress!.downloaded)} / ${formatSize(downloadProgress!.total)} (${downloadProgress!.progress}%)`}
                        </p>
                      </div>
                    ) : (
                      <div className="update-actions">
                        <button
                          className="update-download-btn"
                          onClick={onDownloadAndInstall}
                          disabled={!updateInfo.asset_download_url}
                        >
                          {updateInfo.asset_download_url ? '下载并安装' : '前往下载'}
                        </button>
                        {updateInfo.asset_download_url && (
                          <button className="update-cancel-btn" onClick={onClose}>
                            稍后提醒
                          </button>
                        )}
                        {!updateInfo.asset_download_url && (
                          <button className="update-cancel-btn" onClick={() => open(updateInfo.download_url)}>
                            前往 GitHub Release
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="update-badge current">已是最新版本</div>
                    <div className="update-version-info">
                      <p>当前版本: <span className="version-current">v{updateInfo.current_version}</span></p>
                    </div>
                    <div className="update-actions">
                      <button className="update-cancel-btn" onClick={onClose}>关闭</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="update-checking">
                <span className="update-spinner"></span>
                正在检查更新...
              </div>
            )
          ) : (
            <div
              className="help-content"
              dangerouslySetInnerHTML={{ __html: md.render(content[type].body) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function MenuBar() {
  const {
    content,
    currentFile,
    settings,
    setSettings,
    setSettingsOpen,
    addTab,
    saveFile,
    getActiveTab
  } = useAppStore();

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpModal, setHelpModal] = useState<'shortcuts' | 'syntax' | 'about' | 'update' | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [pdfExportOpen, setPdfExportOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadDone, setDownloadDone] = useState(false);
  const menubarRef = useRef<HTMLDivElement>(null);
  const mouseOverMenuRef = useRef(false);

  const handleNewFile = () => {
    addTab();
    setActiveMenu(null);
  };

  const handleCheckUpdates = async () => {
    setHelpModal('update');
    setUpdateInfo(null);
    try {
      const info = await invoke<UpdateInfo>('check_for_updates');
      setUpdateInfo(info);
    } catch (error) {
      console.error('检查更新失败:', error);
      setUpdateInfo({
        has_update: false,
        current_version: '0.1.2',
        latest_version: '0.1.2',
        download_url: 'https://github.com/zhcx/markitdown/releases',
        asset_download_url: '',
        asset_name: '',
        asset_size: 0,
        release_notes: '检查更新失败，请稍后重试',
        published_at: ''
      });
    }
  };

  const handleDownloadAndInstall = async () => {
    if (!updateInfo?.asset_download_url) return;
    setDownloadProgress({ downloaded: 0, total: updateInfo.asset_size, progress: 0 });
    setDownloadDone(false);

    // Set up progress listener
    const unlistenProgress = await listen<DownloadProgress>('update-download-progress', (event) => {
      setDownloadProgress(event.payload);
    });
    const unlistenComplete = await listen('update-download-complete', () => {
      setDownloadDone(true);
    });

    try {
      await invoke('download_and_install_update', {
        downloadUrl: updateInfo.asset_download_url,
        fileName: updateInfo.asset_name,
      });
    } catch (error) {
      console.error('下载更新失败:', error);
      setDownloadProgress(null);
    } finally {
      unlistenProgress();
      unlistenComplete();
    }
  };

  const handleOpenFile = async () => {
    try {
      const selected = await openDialog({
        filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }],
        multiple: true,
      });
      if (selected) {
        const files = Array.isArray(selected) ? selected : [selected];
        for (const file of files) {
          const fileContent = await invoke<string>('get_file_content', { path: file });
          addTab({ path: file as string, content: fileContent, title: (file as string).split(/[\\/]/).pop() || '未命名' });
        }
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
    setActiveMenu(null);
  };

  const handleSaveFile = async () => {
    if (currentFile) {
      await saveFile(currentFile);
    } else {
      await handleSaveAs();
    }
    setActiveMenu(null);
  };

  const handleSaveAs = async () => {
    try {
      const selected = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: currentFile || 'untitled.md',
      });
      if (selected) {
        await saveFile(selected as string);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
    setActiveMenu(null);
  };

  const getExportFilename = (format: string) => {
    const activeTab = getActiveTab();
    if (activeTab) {
      const title = activeTab.path
        ? activeTab.path.split(/[\\/]/).pop()?.replace(/\.md$/i, '') || activeTab.title
        : activeTab.title;
      return title + '.' + format;
    }
    return 'document.' + format;
  };

  // Render markdown to HTML using the same markdown-it as the preview
  const renderMarkdown = (text: string): string => {
    return md.render(text);
  };

  const handleExport = async (format: 'pdf' | 'html') => {
    try {
      const activeTab = getActiveTab();
      const filePath = activeTab?.path || null;

      // Render markdown to HTML on the front-end using markdown-it
      const htmlBody = renderMarkdown(content);

      if (format === 'html') {
        const defaultFilename = getExportFilename('html');
        const selected = await save({
          filters: [{ name: 'HTML', extensions: ['html'] }],
          defaultPath: defaultFilename,
        });
        if (selected) {
          const fullHtml = await invoke<string>('export_html', {
            htmlBody,
            settings: settings.export,
            filePath
          });
          await invoke('save_file_content', { path: selected, content: fullHtml });
        }
      } else if (format === 'pdf') {
        // 使用新的直接 PDF 导出功能
        const defaultFilename = getExportFilename('pdf');
        const selected = await save({
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          defaultPath: defaultFilename,
        });
        if (selected) {
          await invoke<string>('export_pdf_direct', {
            htmlBody,
            outputPath: selected,
            settings: settings.export,
            options: null,
            filePath
          });
        }
      }
    } catch (error) {
      console.error('Failed to export:', error);
    }
    setActiveMenu(null);
  };

  const menus: MenuGroup[] = [
    {
      label: '文件',
      items: [
        { label: '新建', action: handleNewFile, shortcut: 'Ctrl+N' },
        { label: '打开', action: handleOpenFile, shortcut: 'Ctrl+O' },
        { label: '保存', action: handleSaveFile, shortcut: 'Ctrl+S' },
        { label: '另存为', action: handleSaveAs, shortcut: 'Ctrl+Shift+S' },
        { divider: true, label: '' },
        { label: '导出为 HTML', action: () => handleExport('html') },
        { label: '导出为 PDF...', action: () => { setPdfExportOpen(true); setActiveMenu(null); } },
      ],
    },
    {
      label: '编辑',
      items: [
        { label: '撤销', action: () => document.execCommand('undo'), shortcut: 'Ctrl+Z' },
        { label: '重做', action: () => document.execCommand('redo'), shortcut: 'Ctrl+Y' },
        { divider: true, label: '' },
        { label: '剪切', action: () => document.execCommand('cut'), shortcut: 'Ctrl+X' },
        { label: '复制', action: () => document.execCommand('copy'), shortcut: 'Ctrl+C' },
        { label: '粘贴', action: () => document.execCommand('paste'), shortcut: 'Ctrl+V' },
        { divider: true, label: '' },
        { label: '全选', action: () => document.execCommand('selectAll'), shortcut: 'Ctrl+A' },
      ],
    },
    {
      label: '功能',
      items: [
        { label: '分屏模式', action: () => useAppStore.getState().setMode('split') },
        { label: '沉浸模式', action: () => useAppStore.getState().setMode('immersive') },
        { divider: true, label: '' },
        { label: '浅色主题', action: () => {
          setSettings({ ...settings, appearance: { ...settings.appearance, theme: 'light' } });
          setActiveMenu(null);
        }},
        { label: '深色主题', action: () => {
          setSettings({ ...settings, appearance: { ...settings.appearance, theme: 'dark' } });
          setActiveMenu(null);
        }},
        { label: 'Solarized主题', action: () => {
          setSettings({ ...settings, appearance: { ...settings.appearance, theme: 'solarized' } });
          setActiveMenu(null);
        }},
        { divider: true, label: '' },
        { label: '设置', action: () => setSettingsOpen(true) },
      ],
    },
    {
      label: '帮助',
      items: [
        { label: '快捷键说明', action: () => setHelpModal('shortcuts') },
        { label: 'Markdown 语法', action: () => setHelpModal('syntax') },
        { divider: true, label: '' },
        { label: '检查更新', action: handleCheckUpdates },
        { divider: true, label: '' },
        { label: '关于 MarkitDown', action: () => setHelpModal('about') },
      ],
    },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menubarRef.current && !menubarRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
        setMenuOpen(false);
        mouseOverMenuRef.current = false;
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div className="menubar" ref={menubarRef}
        onMouseEnter={() => { mouseOverMenuRef.current = true; }}
        onMouseLeave={() => {
          mouseOverMenuRef.current = false;
          setTimeout(() => {
            if (!mouseOverMenuRef.current) {
              setActiveMenu(null);
              setMenuOpen(false);
            }
          }, 150);
        }}
      >
        {menus.map((menu) => (
          <div key={menu.label} className="menu-item"
            onMouseEnter={() => { if (menuOpen) setActiveMenu(menu.label); }}
          >
            <button
              className={'menu-trigger' + (activeMenu === menu.label ? ' active' : '')}
              onClick={() => {
                if (activeMenu === menu.label && menuOpen) {
                  setActiveMenu(null);
                  setMenuOpen(false);
                } else {
                  setActiveMenu(menu.label);
                  setMenuOpen(true);
                }
              }}
            >
              {menu.label}
            </button>
            {menuOpen && activeMenu === menu.label && (
              <div className="menu-dropdown">
                {menu.items.map((item, index) => (
                  item.divider ? (
                    <div key={index} className="menu-divider" />
                  ) : (
                    <button key={index} className="menu-option" onClick={item.action}>
                      <span>{item.label}</span>
                      {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                    </button>
                  )
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {helpModal && (
        <HelpModal
          type={helpModal}
          updateInfo={helpModal === 'update' ? updateInfo : undefined}
          downloadProgress={helpModal === 'update' ? downloadProgress : null}
          downloadDone={helpModal === 'update' ? downloadDone : false}
          onDownloadAndInstall={helpModal === 'update' ? handleDownloadAndInstall : undefined}
          onClose={() => setHelpModal(null)}
        />
      )}
      {pdfExportOpen && (
        <PdfExportDialog
          content={content}
          filePath={getActiveTab()?.path || null}
          onClose={() => setPdfExportOpen(false)}
        />
      )}
    </>
  );
}
