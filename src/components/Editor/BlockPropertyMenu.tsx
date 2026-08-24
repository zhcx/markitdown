import type { BlockPropertyType } from './blockCommands.ts';

export interface BlockPropertySelection {
  type: BlockPropertyType;
  attrs?: Record<string, unknown>;
}

interface BlockPropertyMenuProps {
  left: number;
  top: number;
  onSelect: (selection: BlockPropertySelection) => void;
  onClose: () => void;
}

const options: Array<{ label: string; icon: string; selection: BlockPropertySelection }> = [
  { label: '文本', icon: 'T', selection: { type: 'paragraph' } },
  { label: '一级标题', icon: 'H1', selection: { type: 'heading', attrs: { level: 1 } } },
  { label: '二级标题', icon: 'H2', selection: { type: 'heading', attrs: { level: 2 } } },
  { label: '三级标题', icon: 'H3', selection: { type: 'heading', attrs: { level: 3 } } },
  { label: '无序列表', icon: '•', selection: { type: 'bullet_list' } },
  { label: '有序列表', icon: '1.', selection: { type: 'ordered_list' } },
  { label: '待办事项', icon: '□', selection: { type: 'task_list' } },
  { label: '引用', icon: '❯', selection: { type: 'blockquote' } },
  { label: '代码块', icon: '</>', selection: { type: 'code_block' } },
  { label: '分隔线', icon: '—', selection: { type: 'horizontal_rule' } },
];

export function BlockPropertyMenu({ left, top, onSelect, onClose }: BlockPropertyMenuProps) {
  return (
    <div
      className="block-property-menu"
      role="menu"
      aria-label="块类型"
      style={{ left, top }}
      onMouseDown={event => event.preventDefault()}
    >
      <div className="block-property-menu-title">转换为</div>
      {options.map(option => (
        <button
          key={option.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onSelect(option.selection);
            onClose();
          }}
        >
          <span className="block-property-menu-icon" aria-hidden="true">{option.icon}</span>
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
