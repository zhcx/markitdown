import { useRef, useState } from 'react';
import { message, save } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/appStore';
import { resolveSaveBaseName } from '../../utils/saveName';
import { UnsavedChangesDialog } from '../UnsavedChangesDialog/UnsavedChangesDialog';
import type { UnsavedChangesAction } from '../../utils/windowCloseGuard';

export function TabsBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab, saveTab } = useAppStore();
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const closeEpoch = useRef(0);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const pendingCloseTab = tabs.find(tab => tab.id === pendingCloseTabId) ?? null;

  const requestTabClose = (id: string) => {
    const tab = tabs.find(item => item.id === id);
    if (!tab) return;

    closeEpoch.current += 1;
    if (tab.modified) {
      setPendingCloseTabId(id);
      return;
    }

    closeTab(id);
  };

  const resolveTabClose = async (action: UnsavedChangesAction) => {
    if (action === 'cancel') closeEpoch.current += 1;
    if (savingRef.current && action !== 'cancel') return;
    const epoch = closeEpoch.current;
    const tab = useAppStore.getState().tabs.find(item => item.id === pendingCloseTabId);
    if (!tab || action === 'cancel') {
      setPendingCloseTabId(null);
      return;
    }

    try {
    if (action === 'save') {
      savingRef.current = true;
      setSaving(true);
      // 未命名文档且启用 AI 时，先请求文件名建议再打开保存对话框；
      // AI 未启用时 resolveSaveBaseName 立即返回默认值。
      const baseName = tab.path ? '' : await resolveSaveBaseName(tab.title, tab.content);
      if (epoch !== closeEpoch.current) return;
      const path = tab.path ?? await save({
        title: `保存“${tab.title}”`,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
        defaultPath: `${baseName || tab.title.replace(/\.md$/i, '')}.md`,
      });
      if (typeof path !== 'string') {
        setPendingCloseTabId(null);
        return;
      }
      if (epoch !== closeEpoch.current) return;
      await saveTab(tab.id, path);
      if (epoch !== closeEpoch.current || useAppStore.getState().tabs.find(t => t.id === tab.id)?.modified) return;
    }

    setPendingCloseTabId(null);
    if (epoch === closeEpoch.current) closeTab(tab.id);
    } catch (error) {
      await message(`保存失败：${String(error)}`, {title:'无法保存文件',kind:'error'});
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleCloseTab = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    requestTabClose(id);
  };

  const handleTabDoubleClick = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    requestTabClose(id);
  };

  return (
    <div className="tabsbar">
      <div className="tabs-container" role="tablist" aria-label="打开的文档" onDoubleClick={event => {
        if (event.target === event.currentTarget) addTab();
      }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            role="tab"
            tabIndex={tab.id === activeTabId ? 0 : -1}
            aria-selected={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={event => handleTabDoubleClick(event, tab.id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setActiveTab(tab.id);
              }
            }}
          >
            <span className="tab-file-icon" aria-hidden="true" />
            <span className="tab-title">
              {tab.title}
              {tab.modified && <span className="tab-modified">●</span>}
            </span>
            <button type="button" className="tab-close" onClick={event => handleCloseTab(event, tab.id)} title="关闭标签页" aria-label={`关闭 ${tab.title}`}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="new-tab-btn" onClick={() => addTab()} title="新建标签页" aria-label="新建标签页">+</button>
      {pendingCloseTab && (
        <UnsavedChangesDialog
          tabs={[pendingCloseTab]}
          scope="tab"
          busy={saving}
          onAction={(action) => { void resolveTabClose(action); }}
        />
      )}
    </div>
  );
}
