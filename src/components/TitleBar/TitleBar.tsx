import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { MenuBar } from '../MenuBar/MenuBar';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // One-shot initial read — fire-and-forget, no effect nesting
    getCurrentWindow()
      .isMaximized()
      .then((maximized) => {
        if (mountedRef.current && maximized !== isMaximized) {
          setIsMaximized(maximized);
        }
      })
      .catch(() => { /* not critical */ });

    return () => {
      mountedRef.current = false;
    };
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResize = useCallback(async () => {
    try {
      const maximized = await getCurrentWindow().isMaximized();
      if (mountedRef.current) {
        setIsMaximized(maximized);
      }
    } catch { /* not critical */ }
  }, []);

  useEffect(() => {
    const unlistenPromise = getCurrentWindow().onResized(handleResize);
    return () => { unlistenPromise.then(fn => fn()); };
  }, [handleResize]);

  const handleMinimize = async () => {
    await getCurrentWindow().minimize();
  };

  const handleToggleMaximize = async () => {
    await getCurrentWindow().toggleMaximize();
  };

  const handleClose = async () => {
    await getCurrentWindow().close();
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-icon" data-tauri-drag-region="false">M</span>
      <div className="titlebar-menu" data-tauri-drag-region="false">
        <MenuBar />
      </div>
      <div className="titlebar-controls" data-tauri-drag-region="false">
        <button
          className="titlebar-btn titlebar-minimize"
          onClick={handleMinimize}
          title="最小化"
          aria-label="最小化"
        >
          <svg width="12" height="1" viewBox="0 0 12 1"><rect width="12" height="1" fill="currentColor"/></svg>
        </button>
        <button
          className="titlebar-btn titlebar-maximize"
          onClick={handleToggleMaximize}
          title={isMaximized ? '还原' : '最大化'}
          aria-label={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="2" y="0" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1"/>
              <rect x="0" y="2" width="8" height="8" rx="1" fill="var(--bg-elevated)" stroke="currentColor" strokeWidth="1.1"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1"/>
            </svg>
          )}
        </button>
        <button
          className="titlebar-btn titlebar-close"
          onClick={handleClose}
          title="关闭"
          aria-label="关闭"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
