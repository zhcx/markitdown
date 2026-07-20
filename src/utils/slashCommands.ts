export interface SlashCommandInsertion {
  text: string;
  selectionStart?: number;
  selectionEnd?: number;
}

export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  shortcut: string;
  icon: string;
  keywords: string;
  insertion: SlashCommandInsertion;
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
  { id: 'quote', title: '引用', description: '插入引用块', shortcut: '/quote', icon: '❝', keywords: 'quote blockquote 引用', insertion: insertion('> ') },
  { id: 'unordered-list', title: '无序列表', description: '项目列表', shortcut: '/ul', icon: '•', keywords: 'ul bullet list 无序 列表 项目', insertion: insertion('- ') },
  { id: 'ordered-list', title: '有序列表', description: '编号列表', shortcut: '/ol', icon: '1.', keywords: 'ol numbered list 有序 编号 列表', insertion: insertion('1. ') },
  { id: 'task-list', title: '任务列表', description: '插入待办事项', shortcut: '/todo', icon: '☐', keywords: 'todo task checkbox 任务 待办 清单', insertion: insertion('- [ ] ') },
  { id: 'code', title: '代码块', description: '插入多行代码', shortcut: '/code', icon: '</>', keywords: 'code fence 代码 代码块', insertion: insertion('```\n\n```', 4) },
  { id: 'table', title: '表格', description: '插入 3 × 2 表格', shortcut: '/table', icon: '▦', keywords: 'table grid 表格', insertion: insertion('| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |', 2, 5) },
  { id: 'image', title: '图片', description: '插入图片链接', shortcut: '/image', icon: '▧', keywords: 'image photo picture 图片 图像', insertion: insertion('![图片描述](https://)', 2, 6) },
  { id: 'link', title: '链接', description: '插入文本链接', shortcut: '/link', icon: '↗', keywords: 'link url href 链接 网址', insertion: insertion('[链接文字](https://)', 1, 5) },
  { id: 'math', title: '公式', description: '插入行内公式', shortcut: '/math', icon: '∑', keywords: 'math latex formula 数学 公式', insertion: insertion('$公式$', 1, 3) },
  { id: 'math-block', title: '公式块', description: '插入独立公式', shortcut: '/mathblock', icon: '∑', keywords: 'math latex formula block 数学 公式块', insertion: insertion('$$\n\n$$', 3) },
  { id: 'footnote', title: '脚注', description: '插入脚注引用', shortcut: '/footnote', icon: '¹', keywords: 'footnote note 脚注 注释', insertion: insertion('[^1]', 2, 3) },
  { id: 'divider', title: '分割线', description: '插入水平分割线', shortcut: '/hr', icon: '—', keywords: 'hr divider separator 分割线 水平线', insertion: insertion('---') },
  { id: 'mermaid', title: '流程图', description: '插入 Mermaid 流程图', shortcut: '/mermaid', icon: '◇', keywords: 'mermaid diagram flowchart 流程图 图表', insertion: insertion('```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```', 28, 30) },
];

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
