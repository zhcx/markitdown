import type { EditorMode } from '../../types/blockEditor.ts';

interface EditorModeToggleProps {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}

export function EditorModeToggle({ mode, onChange }: EditorModeToggleProps) {
  return (
    <div className="editor-mode-toggle" role="group" aria-label="编辑模式">
      <button type="button" className={mode === 'blocks' ? 'active' : ''} aria-pressed={mode === 'blocks'} onClick={() => onChange('blocks')}>
        块编辑
      </button>
      <button type="button" className={mode === 'source' ? 'active' : ''} aria-pressed={mode === 'source'} onClick={() => onChange('source')}>
        源码
      </button>
    </div>
  );
}
