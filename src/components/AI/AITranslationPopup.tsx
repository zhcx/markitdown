interface AITranslationPopupProps {
  originalText: string;
  translatedText: string;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onApply: (text: string) => void;
}

export function AITranslationPopup({ originalText, translatedText, position, onClose, onApply }: AITranslationPopupProps) {
  if (!position) return null;

  const popupStyle: React.CSSProperties = {
    left: Math.min(position.x, window.innerWidth - 450),
    top: Math.min(position.y + 20, window.innerHeight - 300),
  };

  const handleApplyWithOriginal = () => {
    const comparisonText = `${originalText}\n\n> **翻译:**\n> ${translatedText}\n`;
    onApply(comparisonText);
    onClose();
  };

  const handleApplyOnly = () => {
    onApply(translatedText);
    onClose();
  };

  return (
    <div className="ai-translation-popup" style={popupStyle}>
      <div className="ai-translation-header">
        <span>翻译结果</span>
      </div>
      <div className="ai-translation-content">
        <div className="translation-original">
          <div className="translation-label">原文</div>
          <div className="translation-text">{originalText}</div>
        </div>
        <div className="translation-divider"></div>
        <div className="translation-result">
          <div className="translation-label">译文</div>
          <div className="translation-text highlight">{translatedText}</div>
        </div>
      </div>
      <div className="ai-translation-footer">
        <button className="translation-btn apply-with-original" onClick={handleApplyWithOriginal}>
          保留原文
        </button>
        <button className="translation-btn apply-only" onClick={handleApplyOnly}>
          仅译文
        </button>
        <button className="translation-btn close" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  );
}