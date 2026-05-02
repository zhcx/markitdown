import { useAIStore, ProofreadResult } from '../../stores/aiStore';

export function AIProofreadPanel() {
  const {
    proofreadPanelVisible,
    proofreadResults,
    setProofreadPanelVisible,
    applyProofreadFix
  } = useAIStore();

  if (!proofreadPanelVisible) return null;

  const handleClose = () => {
    setProofreadPanelVisible(false);
  };

  const handleApply = (result: ProofreadResult) => {
    applyProofreadFix(result);
  };

  const getErrorTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      spelling: '拼',
      grammar: '语',
      punctuation: '标',
      style: '风'
    };
    return labels[type] || type.charAt(0);
  };

  return (
    <div className="ai-proofread-panel">
      <div className="ai-proofread-header">
        <h4>校对结果 ({proofreadResults.length}处问题)</h4>
        <button className="close-btn" onClick={handleClose}>x</button>
      </div>
      <div className="ai-proofread-list">
        {proofreadResults.map((result, index) => (
          <div
            key={index}
            className="ai-proofread-item"
          >
            <div className={`error-type ${result.type}`}>
              {getErrorTypeLabel(result.type)}
            </div>
            <div className="error-content">
              <div>
                <span className="original">{result.original}</span>
                <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>→</span>
                <span className="suggestion">{result.suggestion}</span>
              </div>
              <div className="explanation">{result.explanation}</div>
            </div>
            <button
              className="apply-btn"
              onClick={() => handleApply(result)}
            >
              应用
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}