import { useAppStore } from '../../stores/appStore';
import { ask } from '@tauri-apps/plugin-dialog';

export function TabsBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab, saveFile } = useAppStore();

  const handleTabClick = (id: string) => {
    setActiveTab(id);
  };

  const handleCloseTab = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === id);
    if (tab?.modified) {
      const confirmed = await ask(
        `文件 "${tab.title}" 有未保存的更改，是否保存？`,
        { title: '保存更改', okLabel: '保存', cancelLabel: '不保存' }
      );
      if (confirmed) {
        if (tab.path) {
          await saveFile(tab.path);
        } else {
          // If no path, trigger save as dialog
          const { save } = await import('@tauri-apps/plugin-dialog');
          const selected = await save({
            filters: [{ name: 'Markdown', extensions: ['md'] }],
            defaultPath: 'untitled.md',
          });
          if (selected) {
            await saveFile(selected as string);
          } else {
            return; // User cancelled save dialog
          }
        }
      }
    }
    closeTab(id);
  };

  const handleNewTab = () => {
    addTab();
  };

  return (
    <div className="tabsbar">
      <div className="tabs-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            <span className="tab-title">
              {tab.title}
              {tab.modified && <span className="tab-modified">●</span>}
            </span>
            <button
              className="tab-close"
              onClick={(e) => handleCloseTab(e, tab.id)}
              title="关闭"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="new-tab-btn" onClick={handleNewTab} title="新建标签页">
        +
      </button>
    </div>
  );
}
