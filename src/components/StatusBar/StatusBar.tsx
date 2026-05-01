import { useAppStore } from '../../stores/appStore';

export function StatusBar() {
  const { wordCount, mode, currentFile, isSaving, uploadStatus, uploadProgress, uploadMessage } = useAppStore();

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span className="status-item">{mode === 'split' ? '分屏模式' : '沉浸模式'}</span>
        <span className="status-divider">|</span>
        <span className="status-item">{isSaving ? '保存中...' : '已就绪'}</span>
      </div>
      <div className="statusbar-center">
        {uploadStatus !== 'idle' ? (
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
