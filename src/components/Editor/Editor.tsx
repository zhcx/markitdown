import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { EditorMode } from '../../types/blockEditor.ts';
import { parseMarkdown } from '../../utils/markdownBlockCodec.ts';
import { BlockEditor } from './BlockEditor.tsx';
import { EditorModeToggle } from './EditorModeToggle.tsx';
import { EditorUnsupportedNotice } from './EditorUnsupportedNotice.tsx';
import { SourceEditor, type EditorProps } from './SourceEditor.tsx';
import './BlockEditor.css';

export function Editor({ className, style, onActiveLineChange, onActiveLineReveal }: EditorProps) {
  const { content, tabs, activeTabId, setContent, setEditorView, setTabEditorMode } = useAppStore();
  const activeTab = tabs.find(tab => tab.id === activeTabId);
  const requestedMode: EditorMode = activeTab?.editorMode === 'source' ? 'source' : 'blocks';
  const capability = useMemo(() => parseMarkdown(content).capability, [content]);
  const [localMode, setLocalMode] = useState<EditorMode>(requestedMode);
  const effectiveMode: EditorMode = localMode === 'blocks' && !capability.supported ? 'source' : localMode;
  const handleBlockChange = useCallback((markdown: string) => setContent(markdown), [setContent]);
  const handleUnsupported = useCallback(() => setLocalMode('source'), []);

  useEffect(() => {
    setLocalMode(requestedMode);
  }, [activeTabId, requestedMode]);

  const handleModeChange = (mode: EditorMode) => {
    if (mode === 'blocks' && !capability.supported) return;
    setLocalMode(mode);
    if (activeTabId) setTabEditorMode(activeTabId, mode);
    setEditorView(null);
  };

  return (
    <div className="editor-host" style={style}>
      <EditorModeToggle mode={effectiveMode} onChange={handleModeChange} />
      {effectiveMode === 'blocks' ? (
        <BlockEditor
          className={className}
          markdown={content}
          onMarkdownChange={handleBlockChange}
          onUnsupportedMarkdown={handleUnsupported}
          onActiveLineChange={onActiveLineChange}
          onActiveLineReveal={onActiveLineReveal}
        />
      ) : (
        <>
          {localMode === 'blocks' && <EditorUnsupportedNotice capability={capability} />}
          <SourceEditor
            className={className}
            style={{ height: '100%' }}
            onActiveLineChange={onActiveLineChange}
            onActiveLineReveal={onActiveLineReveal}
          />
        </>
      )}
    </div>
  );
}
