type ActivityView = 'explorer' | 'search';

interface ActivityBarProps {
  activeView: ActivityView;
  chatbotVisible: boolean;
  settingsOpen: boolean;
  immersive: boolean;
  theme: string;
  onSelectView: (view: ActivityView) => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onToggleImmersive: () => void;
}

function ActivityIcon({ name }: { name: 'explorer' | 'search' | 'ai' | 'immersive' | 'theme' | 'settings' }) {
  if (name === 'explorer') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h9.5L19 8v12.5H5zM14 3.5V8h5M8 12h8M8 16h8" /></svg>;
  if (name === 'search') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.8" /><path d="m15 15 4.5 4.5" /></svg>;
  if (name === 'ai') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.5 5.1L18.5 10l-5 1.6L12 17l-1.5-5.4-5-1.6 5-1.9zM18.4 15.4l.6 2.1 2.1.6-2.1.7-.6 2.1-.7-2.1-2.1-.7 2.1-.6z" /></svg>;
  if (name === 'immersive') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z" /><circle cx="12" cy="12" r="2.4" /></svg>;
  if (name === 'theme') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M21 12h-2M5 12H3m15.4-6.4-1.4 1.4M7 17.4l-1.4 1.4m0-13.2L7 7m10 10 1.4 1.4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.2" /><path d="M19 13.5a7.3 7.3 0 0 0 .05-3L21 9l-2-3.45-1.8.7a7.5 7.5 0 0 0-2.55-1.48L14.4 3h-4l-.28 1.77A7.5 7.5 0 0 0 7.6 6.25l-1.82-.7L3.8 9l1.95 1.5a7.3 7.3 0 0 0 0 3L3.8 15l1.98 3.45 1.82-.7a7.5 7.5 0 0 0 2.52 1.48L10.4 21h4l.25-1.77a7.5 7.5 0 0 0 2.55-1.48l1.8.7L21 15z" /></svg>;
}

export function ActivityBar({ activeView, chatbotVisible, settingsOpen, immersive, theme, onSelectView, onOpenChat, onOpenSettings, onToggleTheme, onToggleImmersive }: ActivityBarProps) {
  const isDark = theme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : theme.endsWith('-dark');

  return (
    <nav className="activity-bar" aria-label="功能导航">
      <div className="activity-bar-main">
        <button type="button" className={`activity-bar-button ${activeView === 'explorer' ? 'active' : ''}`} onClick={() => onSelectView('explorer')} title="资源管理器" aria-label="资源管理器" aria-current={activeView === 'explorer' ? 'page' : undefined}>
          <ActivityIcon name="explorer" />
        </button>
        <button type="button" className={`activity-bar-button ${activeView === 'search' ? 'active' : ''}`} onClick={() => onSelectView('search')} title="搜索" aria-label="搜索" aria-current={activeView === 'search' ? 'page' : undefined}>
          <ActivityIcon name="search" />
        </button>
        <button type="button" className={`activity-bar-button ${chatbotVisible ? 'active' : ''}`} onClick={onOpenChat} title="AI 对话" aria-label="AI 对话" aria-pressed={chatbotVisible}>
          <ActivityIcon name="ai" />
        </button>
        <button type="button" className={`activity-bar-button ${immersive ? 'active' : ''}`} onClick={onToggleImmersive} title={immersive ? '退出沉浸模式' : '沉浸模式'} aria-label={immersive ? '退出沉浸模式' : '沉浸模式'} aria-pressed={immersive}>
          <ActivityIcon name="immersive" />
        </button>
      </div>
      <div className="activity-bar-bottom">
        <button type="button" className="activity-bar-button activity-theme-button" onClick={onToggleTheme} title={`切换为${isDark ? '明亮' : '暗色'}模式`} aria-label={`切换为${isDark ? '明亮' : '暗色'}模式`}>
          <ActivityIcon name="theme" />
        </button>
        <button type="button" className={`activity-bar-button ${settingsOpen ? 'active' : ''}`} onClick={onOpenSettings} title="设置" aria-label="设置" aria-pressed={settingsOpen}>
          <ActivityIcon name="settings" />
        </button>
      </div>
    </nav>
  );
}
