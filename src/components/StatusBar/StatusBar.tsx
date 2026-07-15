import { useEffect, useRef, useState } from 'react';
import { useAppStore, type Settings } from '../../stores/appStore';
import { useAIStore } from '../../stores/aiStore';

type WritingStyle = Settings['ai']['writing_style'];

const WRITING_STYLES: Array<{ value: WritingStyle; label: string }> = [
  { value: 'formal', label: '正式' },
  { value: 'casual', label: '活泼' },
  { value: 'academic', label: '学术' },
  { value: 'creative', label: '创意' },
  { value: 'custom', label: '自定义' },
];

const styleNames: Record<WritingStyle, string> = Object.fromEntries(
  WRITING_STYLES.map(({ value, label }) => [value, label]),
) as Record<WritingStyle, string>;

function StatusGlyph({ name }: { name: 'ai' | 'success' | 'error' }) {
  if (name === 'ai') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.8.9 3.3 3.3.9-3.3.9L8 9.2l-.9-3.3L3.8 5l3.3-.9zM12.2 10l.5 1.7 1.7.5-1.7.5-.5 1.7-.5-1.7-1.7-.5 1.7-.5z" /></svg>;
  if (name === 'success') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.2 3 3L13 4.5" /></svg>;
  return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="m6 6 4 4m0-4-4 4" /></svg>;
}

export function StatusBar() {
  const { wordCount, mode, currentFile, isSaving, uploadStatus, uploadProgress, uploadMessage, conversionStatus, conversionMessage, settings, saveSettings } = useAppStore();
  const { status: aiStatus, statusMessage: aiStatusMessage, errorCount, setProofreadPanelVisible } = useAIStore();
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const currentStyle = settings.ai.writing_style;
  const companionEnabled = settings.ai.enabled && settings.ai.auto_suggest;

  useEffect(() => {
    if (!styleMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!styleMenuRef.current?.contains(event.target as Node)) {
        setStyleMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStyleMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [styleMenuOpen]);

  const handleStyleSelect = (style: WritingStyle) => {
    const latestSettings = useAppStore.getState().settings;
    setStyleMenuOpen(false);
    void saveSettings({
      ...latestSettings,
      ai: { ...latestSettings.ai, writing_style: style },
    });
  };

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span className="status-item">{mode === 'split' ? '分屏模式' : '沉浸模式'}</span>
        <span className="status-divider" aria-hidden="true" />
        <span className="status-item">{isSaving ? '保存中...' : '已就绪'}</span>
        {settings.ai.enabled && (
          <>
            <span className="status-divider" aria-hidden="true" />
            <span className="status-item ai-enabled" title="AI 助手已启用"><StatusGlyph name="ai" />AI 已启用</span>
            {companionEnabled && (
              <>
                <span className="status-divider" aria-hidden="true" />
                <div className="status-style-control" ref={styleMenuRef}>
                  <button
                    type="button"
                    className={`status-item status-button ai-style${styleMenuOpen ? ' active' : ''}`}
                    title="调整 AI 伴写风格"
                    aria-haspopup="menu"
                    aria-expanded={styleMenuOpen}
                    onClick={() => setStyleMenuOpen((open) => !open)}
                  >
                    <span>风格: {styleNames[currentStyle]}</span>
                    <svg className="status-style-chevron" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m4 10 4-4 4 4" />
                    </svg>
                  </button>
                  {styleMenuOpen && (
                    <div className="status-style-menu" role="menu" aria-label="选择 AI 伴写风格">
                      <div className="status-style-menu-title">AI 伴写风格</div>
                      {WRITING_STYLES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          className={`status-style-option${currentStyle === value ? ' selected' : ''}`}
                          role="menuitemradio"
                          aria-checked={currentStyle === value}
                          title={value === 'custom' ? '自定义提示可在 AI 设置中编辑' : undefined}
                          onClick={() => handleStyleSelect(value)}
                        >
                          <span className="status-style-check" aria-hidden="true">
                            {currentStyle === value ? '✓' : ''}
                          </span>
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
      <div className="statusbar-center">
        {aiStatus !== 'idle' ? (
          <div className="ai-status">
            {(aiStatus === 'loading' || aiStatus === 'proofreading' || aiStatus === 'companion') && (
              <span className="status-item ai-checking">
                <span className="ai-spinner"></span>
                {aiStatusMessage || '处理中...'}
              </span>
            )}
            {aiStatus === 'error' && (
              <span className="status-item ai-error"><StatusGlyph name="error" />{aiStatusMessage || 'AI服务异常'}</span>
            )}
            {aiStatus === 'success' && errorCount > 0 && (
              <button
                type="button"
                className="status-item status-button ai-result clickable"
                onClick={() => setProofreadPanelVisible(true)}
              >
                <StatusGlyph name="success" />发现 {errorCount} 处问题，点击查看
              </button>
            )}
            {aiStatus === 'success' && errorCount === 0 && aiStatusMessage && (
              <span className="status-item ai-success"><StatusGlyph name="success" />{aiStatusMessage}</span>
            )}
          </div>
        ) : conversionStatus !== 'idle' ? (
          <div className="conversion-status">
            {conversionStatus === 'converting' && (
              <span className="status-item conversion-working"><span className="ai-spinner"></span>{conversionMessage}</span>
            )}
            {conversionStatus === 'success' && (
              <span className="status-item conversion-success"><StatusGlyph name="success" />{conversionMessage}</span>
            )}
            {conversionStatus === 'error' && (
              <span className="status-item conversion-error"><StatusGlyph name="error" />{conversionMessage}</span>
            )}
          </div>
        ) : uploadStatus !== 'idle' ? (
          <div className="upload-status">
            {uploadStatus === 'uploading' && (
              <>
                <span className="status-item">上传中...</span>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                </div>
                <span className="status-item">{uploadProgress}%</span>
              </>
            )}
            {uploadStatus === 'success' && (
              <span className="status-item upload-success"><StatusGlyph name="success" />上传成功</span>
            )}
            {uploadStatus === 'error' && (
              <span className="status-item upload-error"><StatusGlyph name="error" />上传失败: {uploadMessage}</span>
            )}
          </div>
        ) : (
          <span className="status-item">{currentFile ? currentFile.split(/[\\/]/).pop() : '未保存'}</span>
        )}
      </div>
      <div className="statusbar-right">
        <span className="status-item">{wordCount}</span>
        <span className="status-divider" aria-hidden="true" />
        <span className="status-item">UTF-8</span>
      </div>
    </div>
  );
}
