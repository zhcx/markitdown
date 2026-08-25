import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  EDITOR_COMMANDS,
  getEditorCommandAvailability,
  groupEditorCommands,
  type EditorCommandContext,
  type EditorCommandDefinition,
} from '../../utils/editorCommandRegistry.ts';
import type { SlashCommand } from '../../utils/slashCommands';

export interface SlashMenuAnchor {
  left: number;
  top: number;
  bottom: number;
}

interface SlashCommandMenuProps {
  anchor: SlashMenuAnchor;
  commands: Array<EditorCommandDefinition | SlashCommand>;
  selectedIndex: number;
  query: string;
  onSelect: (command: EditorCommandDefinition) => void;
  onSelectedIndexChange: (index: number) => void;
  onClose: () => void;
  context?: EditorCommandContext;
}

const VIEWPORT_GAP = 12;
const CURSOR_GAP = 8;
const DEFAULT_CONTEXT: EditorCommandContext = {
  mode: 'source',
  aiEnabled: false,
  aiConfigured: false,
};

function toEditorCommand(command: EditorCommandDefinition | SlashCommand): EditorCommandDefinition {
  if ('category' in command) return command;
  const registered = EDITOR_COMMANDS.find(item => item.id === command.id);
  if (registered) return registered;
  return {
    ...command,
    category: 'media',
    aliases: command.keywords.split(/\s+/u).filter(Boolean),
    keywords: command.keywords.split(/\s+/u).filter(Boolean),
    surfaces: ['slash'],
  };
}

export function SlashCommandMenu({
  anchor,
  commands,
  selectedIndex,
  query,
  onSelect,
  onSelectedIndexChange,
  onClose,
  context = DEFAULT_CONTEXT,
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const groups = groupEditorCommands(commands.map(toEditorCommand));
  const commandIndexById = new Map<string, number>();
  let nextCommandIndex = 0;
  for (const group of groups) {
    for (const command of group.commands) {
      commandIndexById.set(command.id, nextCommandIndex);
      nextCommandIndex += 1;
    }
  }
  const [position, setPosition] = useState({
    left: anchor.left,
    top: anchor.bottom + CURSOR_GAP,
    maxHeight: 420,
  });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const left = Math.max(VIEWPORT_GAP, Math.min(anchor.left, window.innerWidth - rect.width - VIEWPORT_GAP));
    const roomBelow = Math.max(0, window.innerHeight - anchor.bottom - CURSOR_GAP - VIEWPORT_GAP);
    const roomAbove = Math.max(0, anchor.top - CURSOR_GAP - VIEWPORT_GAP);
    const placeBelow = roomBelow >= Math.min(rect.height, 220) || roomBelow >= roomAbove;
    const maxHeight = Math.max(120, Math.min(420, placeBelow ? roomBelow : roomAbove));
    const top = placeBelow
      ? anchor.bottom + CURSOR_GAP
      : Math.max(VIEWPORT_GAP, anchor.top - Math.min(rect.height, maxHeight) - CURSOR_GAP);
    setPosition({ left, top, maxHeight });
  }, [anchor, nextCommandIndex]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose]);

  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-command-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={position}
      role="listbox"
      aria-label="Markdown 快捷命令"
    >
      <div className="slash-command-header">
        <span>{query ? `搜索“${query}”` : '编辑命令'}</span>
        <span className="slash-command-key-hint">↑↓ 选择 · Enter 插入</span>
      </div>
      <div className="slash-command-list">
        {nextCommandIndex > 0 ? groups.map(group => (
          <div className="slash-command-group" key={group.category}>
            <div className="slash-command-group-label">{group.label}</div>
            {group.commands.map(command => {
              const index = commandIndexById.get(command.id) ?? 0;
              const availability = getEditorCommandAvailability(command, context);
              if (!availability.visible) return null;
              return (
                <button
                  type="button"
                  id={`slash-command-${command.id}`}
                  key={command.id}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-disabled={!availability.enabled}
                  data-command-index={index}
                  className={`slash-command-item${index === selectedIndex ? ' selected' : ''}${availability.enabled ? '' : ' disabled'}`}
                  title={availability.reason}
                  disabled={!availability.enabled}
                  onMouseMove={() => onSelectedIndexChange(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (availability.enabled) onSelect(command);
                  }}
                >
                  <span className="slash-command-icon" aria-hidden="true">{command.icon}</span>
                  <span className="slash-command-copy">
                    <strong>{command.title}</strong>
                    <small>{availability.reason || command.description}</small>
                  </span>
                  <span className="slash-command-shortcut">{command.shortcut}</span>
                </button>
              );
            })}
          </div>
        )) : (
          <div className="slash-command-empty">没有匹配的命令</div>
        )}
      </div>
      <div className="slash-command-footer"><kbd>Esc</kbd> 关闭 <span>输入文字可筛选</span></div>
    </div>
  );
}
