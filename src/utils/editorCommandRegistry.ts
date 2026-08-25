import { SLASH_COMMANDS, type BlockSlashAction, type SlashCommandInsertion } from './slashCommands.ts';

export type EditorCommandCategory = 'blocks' | 'format' | 'media' | 'ai';
export type EditorCommandSurface = 'slash' | 'block-menu' | 'toolbar';
export type AIEditorCommandId = 'ai-rewrite' | 'ai-translate' | 'ai-proofread' | 'ai-summary' | 'ai-continue';

export interface EditorCommandContext {
  mode: 'blocks' | 'source';
  aiEnabled: boolean;
  aiConfigured: boolean;
}

export interface EditorCommandAvailability {
  visible: boolean;
  enabled: boolean;
  reason?: string;
}

export interface EditorCommandDefinition {
  id: string;
  category: EditorCommandCategory;
  title: string;
  description: string;
  shortcut: string;
  icon: string;
  aliases: string[];
  keywords: string[];
  surfaces: EditorCommandSurface[];
  insertion?: SlashCommandInsertion;
  blockAction?: BlockSlashAction;
  aiAction?: AIEditorCommandId;
}

export interface EditorCommandGroup {
  category: EditorCommandCategory;
  label: string;
  commands: EditorCommandDefinition[];
}

const BLOCK_COMMAND_IDS = new Set([
  'heading-1', 'heading-2', 'heading-3', 'heading-4', 'quote',
  'unordered-list', 'ordered-list', 'task-list', 'code', 'divider',
]);
const FORMAT_COMMAND_IDS = new Set(['bold', 'italic', 'strikethrough', 'highlight', 'inline-code', 'link']);

function categoryFor(commandId: string): EditorCommandCategory {
  if (BLOCK_COMMAND_IDS.has(commandId)) return 'blocks';
  if (FORMAT_COMMAND_IDS.has(commandId)) return 'format';
  return 'media';
}

function surfacesFor(category: EditorCommandCategory): EditorCommandSurface[] {
  if (category === 'blocks') return ['slash', 'block-menu', 'toolbar'];
  if (category === 'format') return ['slash', 'toolbar'];
  return ['slash'];
}

const CATEGORY_ORDER: EditorCommandCategory[] = ['blocks', 'format', 'media', 'ai'];
const CATEGORY_LABELS: Record<EditorCommandCategory, string> = {
  blocks: '基础块',
  format: '格式',
  media: '媒体',
  ai: 'AI 写作',
};

const TEXT_COMMAND: EditorCommandDefinition = {
  id: 'paragraph',
  category: 'blocks',
  title: '正文',
  description: '转换为普通文本块',
  shortcut: '/text',
  icon: 'T',
  aliases: ['text', 'paragraph'],
  keywords: ['正文', '文本'],
  surfaces: ['slash', 'block-menu'],
  blockAction: { kind: 'turn-into', type: 'paragraph' },
};

const AI_COMMANDS: EditorCommandDefinition[] = [
  { id: 'ai-rewrite', category: 'ai', title: '改写当前块', description: '优化表达并确认差异', shortcut: '/rewrite', icon: 'AI', aliases: ['rewrite', 'polish', '润色'], keywords: ['改写', '优化', '表达'], surfaces: ['slash', 'block-menu'], aiAction: 'ai-rewrite' },
  { id: 'ai-translate', category: 'ai', title: '翻译', description: '翻译当前块或选区', shortcut: '/translate', icon: '译', aliases: ['translate'], keywords: ['翻译', '语言'], surfaces: ['slash', 'block-menu'], aiAction: 'ai-translate' },
  { id: 'ai-proofread', category: 'ai', title: '校对', description: '检查当前块或选区', shortcut: '/proofread', icon: '校', aliases: ['proofread', 'check'], keywords: ['校对', '错别字', '语法'], surfaces: ['slash', 'block-menu'], aiAction: 'ai-proofread' },
  { id: 'ai-summary', category: 'ai', title: '生成摘要', description: '在当前块下方插入摘要', shortcut: '/summary', icon: '摘', aliases: ['summary'], keywords: ['摘要', '总结'], surfaces: ['slash'], aiAction: 'ai-summary' },
  { id: 'ai-continue', category: 'ai', title: '续写', description: '基于当前块继续写作', shortcut: '/continue', icon: '续', aliases: ['continue', 'complete'], keywords: ['续写', '伴写'], surfaces: ['slash', 'block-menu'], aiAction: 'ai-continue' },
];

export function filterEditorCommands(query: string, commands: EditorCommandDefinition[] = EDITOR_COMMANDS) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return commands;
  return commands.filter((command) => [command.title, command.description, command.shortcut, ...command.aliases, ...command.keywords]
    .join(' ').toLocaleLowerCase().includes(normalized));
}

export function groupEditorCommands(commands: EditorCommandDefinition[]): EditorCommandGroup[] {
  return CATEGORY_ORDER.map(category => ({
    category,
    label: CATEGORY_LABELS[category],
    commands: commands.filter(command => command.category === category),
  })).filter(group => group.commands.length > 0);
}

export function getEditorCommandAvailability(
  command: EditorCommandDefinition,
  context: EditorCommandContext,
): EditorCommandAvailability {
  if (command.category === 'ai' && (!context.aiEnabled || !context.aiConfigured)) {
    return { visible: true, enabled: false, reason: '请先在设置中启用并配置 AI' };
  }
  if (context.mode === 'blocks' && !command.blockAction && !command.insertion && !command.aiAction) {
    return { visible: false, enabled: false };
  }
  return { visible: true, enabled: true };
}

export const EDITOR_COMMANDS: EditorCommandDefinition[] = [
  TEXT_COMMAND,
  ...SLASH_COMMANDS.map((command) => {
    const category = categoryFor(command.id);
    return {
      ...command,
      category,
      aliases: command.keywords.split(/\s+/u).filter(Boolean),
      keywords: command.keywords.split(/\s+/u).filter(Boolean),
      surfaces: surfacesFor(category),
    };
  }),
  ...AI_COMMANDS,
];
