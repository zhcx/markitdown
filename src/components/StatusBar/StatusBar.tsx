import { useAppStore } from '../../stores/appStore';
import { useAIStore } from '../../stores/aiStore';

export function StatusBar() {
  const { wordCount, mode, currentFile, isSaving, uploadStatus, uploadProgress, uploadMessage, settings } = useAppStore();
  const { status: aiStatus, statusMessage: aiStatusMessage, errorCount, currentStyle, setProofreadPanelVisible } = useAIStore();

  const styleNames: Record<string, string> = {
    formal: '正式',
    casual: '活泼',
    academic: '学术',
    creative: '创意',
    custom: '自定义'
  };

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span className="status-item">{mode === 'split' ? '分屏模式' : '沉浸模式'}</span>
        <span className="status-divider">|</span>
        <span className="status-item">{isSaving ? '保存中...' : '已就绪'}</span>
        {settings.ai.enabled && (
          <>
            <span className="status-divider">|</span>
            <span className="status-item ai-enabled" title="AI助手已启用">🤖 AI已启用</span>
            <span className="status-divider">|</span>
            <span className="status-item ai-style" title="点击切换风格">风格: {styleNames[currentStyle] || currentStyle}</span>
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
              <span className="status-item ai-error">✗ {aiStatusMessage || 'AI服务异常'}</span>
            )}
            {aiStatus === 'success' && errorCount > 0 && (
              <span
                className="status-item ai-result clickable"
                onClick={() => setProofreadPanelVisible(true)}
              >
                ✓ 发现 {errorCount} 处问题，点击查看
              </span>
            )}
            {aiStatus === 'success' && errorCount === 0 && aiStatusMessage && (
              <span className="status-item ai-success">✓ {aiStatusMessage}</span>
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
              <span className="status-item upload-success">✓ 上传成功</span>
            )}
            {uploadStatus === 'error' && (
              <span className="status-item upload-error">✗ 上传失败: {uploadMessage}</span>
            )}
          </div>
        ) : (
          <span className="status-item">{currentFile ? currentFile.split(/[\\/]/).pop() : '未保存'}</span>
        )}
      </div>
      <div className="statusbar-right">
        <span className="status-item">{wordCount}</span>
        <span className="status-divider">|</span>
        <span className="status-item">UTF-8</span>
      </div>
    </div>
  );
}
