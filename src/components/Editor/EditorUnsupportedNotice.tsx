import type { MarkdownCapability } from '../../types/blockEditor.ts';

interface EditorUnsupportedNoticeProps {
  capability: MarkdownCapability;
  reason?: string | null;
  onSwitchToSource?: () => void;
}

export function EditorUnsupportedNotice({ capability, reason, onSwitchToSource }: EditorUnsupportedNoticeProps) {
  return (
    <div className="editor-unsupported-notice" role="status">
      <strong>{reason ? '块编辑器暂时不可用' : '已切换到源码模式'}</strong>
      <span>{reason || capability.message || '该文档包含块编辑器暂不支持的 Markdown 结构。'}</span>
      {onSwitchToSource && <button type="button" onClick={onSwitchToSource}>继续使用源码编辑</button>}
    </div>
  );
}
