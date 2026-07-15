import { ask, save } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/appStore';

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window;

export function TabsBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab, saveFile } = useAppStore();

  const closeWithConfirmation = async (id: string) => {
    const tab = tabs.find(item => item.id === id);
    if (!tab) return;

    if (tab.modified) {
      if (!isTauriRuntime()) {
        const discard = window.confirm(`“${tab.title}”有未保存的更改。确定关闭并放弃这些更改吗？`);
        if (!discard) return;
      } else {
        const shouldSave = await ask(
          `文件“${tab.title}”有未保存的更改，是否保存？`,
          { title: '保存更改', okLabel: '保存', cancelLabel: '不保存' },
        );
        if (shouldSave) {
          if (tab.path) {
            await saveFile(tab.path);
          } else {
            const selected = await save({
              filters: [{ name: 'Markdown', extensions: ['md'] }],
              defaultPath: 'untitled.md',
            });
            if (!selected) return;
            await saveFile(selected as string);
          }
        }
      }
    }

    closeTab(id);
  };

  const handleCloseTab = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    void closeWithConfirmation(id);
  };

  const handleTabDoubleClick = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    void closeWithConfirmation(id);
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
    </div>
  );
}
