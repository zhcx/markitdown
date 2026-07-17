export interface MarkdownFormatResult {
  content: string;
  issues: string[];
  changed: boolean;
}

export function formatMarkdown(source: string): MarkdownFormatResult {
  const issues = new Set<string>();
  const output: string[] = [];
  let fence: '`' | '~' | null = null;
  let previousBlank = false;

  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    let line = rawLine.replace(/[ \t]+$/g, '');
    if (line !== rawLine) issues.add('移除行尾多余空格');

    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~';
      fence = fence === marker ? null : fence || marker;
      output.push(line);
      previousBlank = false;
      continue;
    }

    if (!fence) {
      const heading = line.match(/^(#{1,6})([^#\s].*)$/);
      if (heading) {
        line = `${heading[1]} ${heading[2].trimStart()}`;
        issues.add('修正标题井号后的空格');
      }

      const unordered = line.match(/^(\s*)[+*](\s+)(.*)$/);
      if (unordered) {
        line = `${unordered[1]}- ${unordered[3]}`;
        issues.add('统一无序列表标记为 “-”');
      } else {
        const missingListSpace = line.match(/^(\s*)-([^\s-].*)$/);
        if (missingListSpace) {
          line = `${missingListSpace[1]}- ${missingListSpace[2]}`;
          issues.add('修正列表标记后的空格');
        }
      }

      const ordered = line.match(/^(\s*)(\d+)\.([^\s].*)$/);
      if (ordered) {
        line = `${ordered[1]}${ordered[2]}. ${ordered[3]}`;
        issues.add('修正有序列表编号后的空格');
      }

      const task = line.match(/^(\s*[-*+]\s+)\[\s*([xX]?)\s*\]\s*(.*)$/);
      if (task) {
        line = `${task[1].replace(/[*+]\s+$/, '- ')}[${task[2] ? 'x' : ' '}] ${task[3]}`.trimEnd();
        issues.add('规范任务列表复选框');
      }

      if (/^\s*(?:\*\s*){3,}$/.test(line) || /^\s*(?:_\s*){3,}$/.test(line)) {
        line = '---';
        issues.add('统一分隔线格式');
      }
    }

    const blank = line.trim() === '';
    if (blank && previousBlank) {
      issues.add('合并连续空行');
      continue;
    }
    output.push(line);
    previousBlank = blank;
  }

  while (output.length > 0 && output[output.length - 1] === '') output.pop();
  if (fence) issues.add('检测到未闭合的代码块，请人工检查');
  const content = `${output.join('\n')}\n`;
  return { content, issues: [...issues], changed: content !== source };
}
