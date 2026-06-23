import { useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';

interface HeadingItem {
  level: number;
  text: string;
  line: number;
}

function parseHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const lines = content.split('\n');
  let lineNum = 0;
  for (const line of lines) {
    lineNum++;
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: lineNum,
      });
    }
  }
  return headings;
}

interface OutlinePanelProps {
  style?: React.CSSProperties;
}

export function OutlinePanel({ style }: OutlinePanelProps) {
  const { content, outlineVisible, setOutlineVisible } = useAppStore();

  const headings = useMemo(() => parseHeadings(content), [content]);

  if (!outlineVisible) return null;

  const scrollToLine = (line: number) => {
    const { editorView } = useAppStore.getState();
    if (editorView) {
      const pos = editorView.state.doc.line(line).from;
      editorView.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true,
      });
      editorView.focus();
    }
  };

  return (
    <div className="outline-panel" style={style}>
      <div className="outline-panel-header">
        <h3>大纲</h3>
        <button className="outline-close-btn" onClick={() => setOutlineVisible(false)} title="关闭大纲">
          ×
        </button>
      </div>
      <div className="outline-panel-content">
        {headings.length === 0 ? (
          <div className="outline-empty">
            <span>文档中未检测到标题</span>
          </div>
        ) : (
          <nav className="outline-list">
            {headings.map((h, i) => (
              <button
                key={i}
                className="outline-item"
                data-level={h.level}
                style={{ paddingLeft: `${12 + (h.level - 1) * 16}px` }}
                onClick={() => scrollToLine(h.line)}
                title={h.text}
              >
                <span className="outline-item-text">{h.text}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
