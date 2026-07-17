import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/appStore';
import { UnsavedChangesDialog } from '../UnsavedChangesDialog/UnsavedChangesDialog';
import type { UnsavedChangesAction } from '../../utils/windowCloseGuard';

export function TabsBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab, saveTab } = useAppStore();
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const pendingCloseTab = tabs.find(tab => tab.id === pendingCloseTabId) ?? null;

  const requestTabClose = (id: string) => {
    const tab = tabs.find(item => item.id === id);
    if (!tab) return;

    if (tab.modified) {
      setPendingCloseTabId(id);
      return;
    }

    closeTab(id);
  };

  const resolveTabClose = async (action: UnsavedChangesAction) => {
    const tab = useAppStore.getState().tabs.find(item => item.id === pendingCloseTabId);
    if (!tab || action === 'cancel') {
      setPendingCloseTabId(null);
      return;
    }

    if (action === 'save') {
      const path = tab.path ?? await save({
        title: `保存“${tab.title}”`,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
        defaultPath: tab.title === '未命名' ? '未命名.md' : tab.title,
      });
      if (typeof path !== 'string') {
        setPendingCloseTabId(null);
        return;
      }
      await saveTab(tab.id, path);
    }

    setPendingCloseTabId(null);
    closeTab(tab.id);
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
          onAction={(action) => { void resolveTabClose(action); }}
        />
      )}
    </div>
  );
}
