export interface SlashCommandInsertion {
  text: string;
  selectionStart?: number;
  selectionEnd?: number;
}

export type BlockSlashAction =
  | { kind: 'turn-into'; type: 'heading'; level: 1 | 2 | 3 | 4 }
  | { kind: 'insert'; type: 'bullet_list' | 'ordered_list' | 'task_list' | 'blockquote' | 'code_block' | 'horizontal_rule' | 'image' };

export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  shortcut: string;
  icon: string;
  keywords: string;
  insertion: SlashCommandInsertion;
  blockAction?: BlockSlashAction;
}

export interface SlashCommandTrigger {
  from: number;
  to: number;
  query: string;
}

const insertion = (
  text: string,
  selectionStart = text.length,
  selectionEnd = selectionStart,
): SlashCommandInsertion => ({ text, selectionStart, selectionEnd });

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'heading-1', title: '一级标题', description: '大标题', shortcut: '/h1', icon: 'H1', keywords: 'h1 heading title 标题 大标题', insertion: insertion('# ') },
  { id: 'heading-2', title: '二级标题', description: '章节标题', shortcut: '/h2', icon: 'H2', keywords: 'h2 heading title 标题 章节', insertion: insertion('## ') },
  { id: 'heading-3', title: '三级标题', description: '小节标题', shortcut: '/h3', icon: 'H3', keywords: 'h3 heading title 标题 小节', insertion: insertion('### ') },
  { id: 'heading-4', title: '四级标题', description: '细分小节', shortcut: '/h4', icon: 'H4', keywords: 'h4 heading title 标题 小节', insertion: insertion('#### ') },
  { id: 'bold', title: '加粗', description: '强调选中文字', shortcut: '/bold', icon: 'B', keywords: 'bold strong 加粗 粗体 强调', insertion: insertion('****', 2) },
  { id: 'italic', title: '斜体', description: '使用斜体强调', shortcut: '/italic', icon: 'I', keywords: 'italic emphasis 斜体 强调', insertion: insertion('**', 1) },
  { id: 'strikethrough', title: '删除线', description: '标记删除内容', shortcut: '/strike', icon: 'S', keywords: 'strike delete 删除线 划线', insertion: insertion('~~~~', 2) },
  { id: 'highlight', title: '高亮', description: '突出显示文字', shortcut: '/highlight', icon: '==', keywords: 'highlight mark 高亮 标记', insertion: insertion('====', 2) },
  { id: 'inline-code', title: '行内代码', description: '插入短代码片段', shortcut: '/inlinecode', icon: '`', keywords: 'inline code 行内代码 代码', insertion: insertion('``', 1) },
  { id: 'quote', title: '引用', description: '插入引用块', shortcut: '/quote', icon: '❝', keywords: 'quote blockquote 引用', insertion: insertion('> ') },
  { id: 'unordered-list', title: '无序列表', description: '项目列表', shortcut: '/ul', icon: '•', keywords: 'ul bullet list 无序 列表 项目', insertion: insertion('- ') },
  { id: 'ordered-list', title: '有序列表', description: '编号列表', shortcut: '/ol', icon: '1.', keywords: 'ol numbered list 有序 编号 列表', insertion: insertion('1. ') },
  { id: 'task-list', title: '任务列表', description: '插入待办事项', shortcut: '/todo', icon: '☐', keywords: 'todo task checkbox 任务 待办 清单', insertion: insertion('- [ ] ') },
  { id: 'code', title: '代码块', description: '插入多行代码', shortcut: '/code', icon: '</>', keywords: 'code fence 代码 代码块', insertion: insertion('```\n\n```', 4) },
  { id: 'table', title: '表格', description: '插入 3 × 2 表格', shortcut: '/table', icon: '▦', keywords: 'table grid 表格', insertion: insertion('| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |', 2, 5) },
  { id: 'image', title: '图片', description: '插入图片链接', shortcut: '/image', icon: '▧', keywords: 'image photo picture 图片 图像', insertion: insertion('![图片描述](https://)', 2, 6) },
  { id: 'video', title: '视频', description: '插入视频链接', shortcut: '/video', icon: '▶', keywords: 'video bilibili youtube vimeo 视频', insertion: insertion('@[video](https://)', 9, 16) },
  { id: 'emoji', title: '表情', description: '插入 Emoji', shortcut: '/emoji', icon: '☺', keywords: 'emoji 表情 符号', insertion: insertion('😀') },
  { id: 'link', title: '链接', description: '插入文本链接', shortcut: '/link', icon: '↗', keywords: 'link url href 链接 网址', insertion: insertion('[链接文字](https://)', 1, 5) },
  { id: 'math', title: '公式', description: '插入行内公式', shortcut: '/math', icon: '∑', keywords: 'math latex formula 数学 公式', insertion: insertion('$公式$', 1, 3) },
  { id: 'math-block', title: '公式块', description: '插入独立公式', shortcut: '/mathblock', icon: '∑', keywords: 'math latex formula block 数学 公式块', insertion: insertion('$$\n\n$$', 3) },
  { id: 'footnote', title: '脚注', description: '插入脚注引用', shortcut: '/footnote', icon: '¹', keywords: 'footnote note 脚注 注释', insertion: insertion('[^1]', 2, 3) },
  { id: 'divider', title: '分割线', description: '插入水平分割线', shortcut: '/hr', icon: '—', keywords: 'hr divider separator 分割线 水平线', insertion: insertion('---') },
  { id: 'toc', title: '目录', description: '插入文档目录', shortcut: '/toc', icon: '☷', keywords: 'toc table contents 目录', insertion: insertion('[TOC]') },
  { id: 'details', title: '折叠内容', description: '插入可展开区域', shortcut: '/details', icon: '▸', keywords: 'details collapse 折叠 展开', insertion: insertion('<details>\n<summary>展开查看</summary>\n\n内容\n\n</details>', 19, 23) },
  { id: 'comment', title: '注释', description: '插入不显示的注释', shortcut: '/comment', icon: '※', keywords: 'comment 注释 备注', insertion: insertion('<!-- 注释 -->', 5, 7) },
  { id: 'mermaid', title: '流程图', description: '插入 Mermaid 流程图', shortcut: '/mermaid', icon: '◇', keywords: 'mermaid diagram flowchart 流程图 图表', insertion: insertion('```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```', 28, 30) },
];

const BLOCK_SLASH_ACTIONS: Record<string, BlockSlashAction> = {
  'heading-1': { kind: 'turn-into', type: 'heading', level: 1 },
  'heading-2': { kind: 'turn-into', type: 'heading', level: 2 },
  'heading-3': { kind: 'turn-into', type: 'heading', level: 3 },
  'heading-4': { kind: 'turn-into', type: 'heading', level: 4 },
  quote: { kind: 'insert', type: 'blockquote' },
  'unordered-list': { kind: 'insert', type: 'bullet_list' },
  'ordered-list': { kind: 'insert', type: 'ordered_list' },
  'task-list': { kind: 'insert', type: 'task_list' },
  code: { kind: 'insert', type: 'code_block' },
  image: { kind: 'insert', type: 'image' },
  divider: { kind: 'insert', type: 'horizontal_rule' },
};

for (const command of SLASH_COMMANDS) {
  const action = BLOCK_SLASH_ACTIONS[command.id];
  if (action) command.blockAction = action;
}

/** Detects a slash command only when `/query` is the first token on a line. */
export function findSlashCommandTrigger(
  lineText: string,
  lineStart: number,
  cursorOffset: number,
): SlashCommandTrigger | null {
  const columnOffset = cursorOffset - lineStart;
  if (columnOffset < 0 || columnOffset > lineText.length) return null;

  const beforeCursor = lineText.slice(0, columnOffset);
  const match = /^(\s*)\/([^\s/]*)$/u.exec(beforeCursor);
  if (!match) return null;

  const from = lineStart + match[1].length;
  return { from, to: cursorOffset, query: match[2] };
}

export function filterSlashCommands(query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return SLASH_COMMANDS;

  return SLASH_COMMANDS.filter((command) => {
    const searchable = `${command.title} ${command.description} ${command.shortcut.slice(1)} ${command.keywords}`.toLocaleLowerCase();
    return searchable.includes(normalized);
  });
}
