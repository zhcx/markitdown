import {
  getEditorCommandAvailability,
  groupEditorCommands,
  type EditorCommandContext,
  type EditorCommandDefinition,
} from '../../utils/editorCommandRegistry.ts';

interface BlockPropertyMenuProps {
  left: number;
  top: number;
  commands: EditorCommandDefinition[];
  context: EditorCommandContext;
  onSelect: (command: EditorCommandDefinition) => void;
  onClose: () => void;
}

const categoryLabel = (category: EditorCommandDefinition['category']) => category === 'ai' ? 'AI 写作' : '转换为';

export function BlockPropertyMenu({ left, top, commands, context, onSelect, onClose }: BlockPropertyMenuProps) {
  const groups = groupEditorCommands(commands);
  return (
    <div
      className="block-property-menu"
      role="menu"
      aria-label="块类型"
      style={{ left, top }}
      onMouseDown={event => event.preventDefault()}
    >
      {groups.map(group => (
        <div className="block-property-menu-group" key={group.category}>
          <div className="block-property-menu-title">{categoryLabel(group.category)}</div>
          {group.commands.map(command => {
            const availability = getEditorCommandAvailability(command, context);
            if (!availability.visible) return null;
            return (
              <button
                key={command.id}
                type="button"
                role="menuitem"
                disabled={!availability.enabled}
                title={availability.reason}
                onClick={() => {
                  if (!availability.enabled) return;
                  onSelect(command);
                  onClose();
                }}
              >
                <span className="block-property-menu-icon" aria-hidden="true">{command.icon}</span>
                <span>{command.title}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
