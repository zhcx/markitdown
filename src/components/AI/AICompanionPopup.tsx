import { useAIStore } from '../../stores/aiStore';
import { useAppStore } from '../../stores/appStore';

export function AICompanionPopup() {
  const {
    companionVisible,
    companionPosition,
    companionSuggestions,
    currentStyle,
    setCompanionVisible,
    applySuggestion,
    getCompanionSuggestion,
    clearResults
  } = useAIStore();

  useAppStore();

  if (!companionVisible || !companionPosition) return null;

  const handleApply = (suggestion: string) => {
    applySuggestion(suggestion);
  };

  const handleRefresh = () => {
    const { editorView } = useAppStore.getState();
    if (editorView) {
      const selection = editorView.state.selection.main;
      const textBefore = editorView.state.sliceDoc(Math.max(0, selection.to - 500), selection.to);
      getCompanionSuggestion(textBefore);
    }
  };

  const handleClose = () => {
    setCompanionVisible(false);
    clearResults();
  };

  // 计算弹出框位置，确保不超出屏幕
  const popupStyle: React.CSSProperties = {
    left: Math.min(companionPosition.x, window.innerWidth - 420),
    top: Math.min(companionPosition.y + 20, window.innerHeight - 350),
  };

  return (
    <div className="ai-companion-popup" style={popupStyle}>
      <div className="ai-companion-header">
        <span>AI伴写建议</span>
        <span className="style-badge">{getStyleLabel(currentStyle)}</span>
      </div>
      <div className="ai-suggestion-list">
        {companionSuggestions.length > 0 ? (
          companionSuggestions.map((suggestion, index) => (
            <div
              key={index}
              className="ai-suggestion-item"
              onClick={() => handleApply(suggestion)}
            >
              {suggestion}
            </div>
          ))
        ) : (
          <div className="ai-suggestion-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>
            暂无建议
          </div>
        )}
      </div>
      <div className="ai-companion-footer">
        <button className="ai-companion-btn refresh" onClick={handleRefresh}>
          刷新
        </button>
        <button className="ai-companion-btn close" onClick={handleClose}>
          关闭
        </button>
      </div>
    </div>
  );
}

function getStyleLabel(style: string): string {
  const labels: Record<string, string> = {
    formal: '正式',
    casual: '活泼',
    academic: '学术',
    creative: '创意',
    custom: '自定义'
  };
  return labels[style] || style;
}
