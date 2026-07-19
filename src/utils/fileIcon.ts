export type FileIconShape =
  | 'archive' | 'audio' | 'binary' | 'book' | 'brace' | 'code' | 'config'
  | 'database' | 'docker' | 'document' | 'font' | 'git' | 'image'
  | 'language' | 'lock' | 'mail' | 'markdown' | 'notebook' | 'office'
  | 'package' | 'sheet' | 'terminal' | 'video';

export interface FileIconDescriptor {
  kind: string;
  shape: FileIconShape;
  label?: string;
}

const textFileExtensions = new Set([
  'bash', 'bat', 'c', 'cc', 'cfg', 'cjs', 'cmd', 'conf', 'cpp', 'cs', 'css', 'cts', 'cxx',
  'dart', 'diff', 'env', 'ex', 'exs', 'fish', 'fs', 'fsx', 'go', 'groovy', 'h', 'hpp',
  'htm', 'html', 'ini', 'java', 'jl', 'js', 'json', 'jsonc', 'jsonl', 'jsx', 'kt', 'kts',
  'less', 'log', 'lua', 'markdown', 'md', 'mdx', 'mjs', 'mts', 'patch', 'php', 'properties',
  'ps1', 'py', 'rb', 'rs', 'sass', 'scala', 'scss', 'sh', 'sql', 'svelte', 'swift', 'toml',
  'ts', 'tsv', 'tsx', 'txt', 'vb', 'vue', 'xml', 'xsl', 'yaml', 'yml', 'zsh',
]);

export function isTextFileName(filename: string): boolean {
  const name = filename.split(/[\\/]/).pop()?.toLowerCase() || filename.toLowerCase();
  if (/^(?:dockerfile|makefile|readme|license|\.gitignore|\.gitattributes)$/.test(name)) return true;
  if (/^\.env(?:\.|$)/.test(name)) return true;
  const extension = name.includes('.') ? name.split('.').pop() || '' : '';
  return textFileExtensions.has(extension);
}

const languageIcons: Record<string, FileIconDescriptor> = {
  c: { kind: 'c', shape: 'language', label: 'C' },
  cc: { kind: 'cpp', shape: 'language', label: 'C+' },
  cpp: { kind: 'cpp', shape: 'language', label: 'C+' },
  cxx: { kind: 'cpp', shape: 'language', label: 'C+' },
  h: { kind: 'c', shape: 'language', label: 'H' },
  hpp: { kind: 'cpp', shape: 'language', label: 'H+' },
  cs: { kind: 'csharp', shape: 'language', label: 'C#' },
  dart: { kind: 'dart', shape: 'language', label: 'D' },
  ex: { kind: 'elixir', shape: 'language', label: 'Ex' },
  exs: { kind: 'elixir', shape: 'language', label: 'Ex' },
  fs: { kind: 'fsharp', shape: 'language', label: 'F#' },
  fsx: { kind: 'fsharp', shape: 'language', label: 'F#' },
  go: { kind: 'go', shape: 'language', label: 'GO' },
  groovy: { kind: 'groovy', shape: 'language', label: 'G' },
  java: { kind: 'java', shape: 'language', label: 'J' },
  js: { kind: 'javascript', shape: 'language', label: 'JS' },
  cjs: { kind: 'javascript', shape: 'language', label: 'JS' },
  mjs: { kind: 'javascript', shape: 'language', label: 'JS' },
  jsx: { kind: 'react', shape: 'language', label: 'JSX' },
  jl: { kind: 'julia', shape: 'language', label: 'JL' },
  kt: { kind: 'kotlin', shape: 'language', label: 'K' },
  kts: { kind: 'kotlin', shape: 'language', label: 'K' },
  lua: { kind: 'lua', shape: 'language', label: 'Lua' },
  php: { kind: 'php', shape: 'language', label: 'php' },
  py: { kind: 'python', shape: 'language', label: 'Py' },
  rb: { kind: 'ruby', shape: 'language', label: 'Rb' },
  rs: { kind: 'rust', shape: 'language', label: 'Rs' },
  scala: { kind: 'scala', shape: 'language', label: 'Sc' },
  swift: { kind: 'swift', shape: 'language', label: 'S' },
  ts: { kind: 'typescript', shape: 'language', label: 'TS' },
  cts: { kind: 'typescript', shape: 'language', label: 'TS' },
  mts: { kind: 'typescript', shape: 'language', label: 'TS' },
  tsx: { kind: 'react', shape: 'language', label: 'TSX' },
  vb: { kind: 'visual-basic', shape: 'language', label: 'VB' },
};

const extensionIcons: Record<string, FileIconDescriptor> = {
  md: { kind: 'markdown', shape: 'markdown' }, markdown: { kind: 'markdown', shape: 'markdown' }, mdx: { kind: 'markdown', shape: 'markdown' },
  txt: { kind: 'text', shape: 'document' }, log: { kind: 'log', shape: 'document' }, diff: { kind: 'diff', shape: 'document' }, patch: { kind: 'diff', shape: 'document' },
  json: { kind: 'json', shape: 'brace' }, jsonc: { kind: 'json', shape: 'brace' }, jsonl: { kind: 'json', shape: 'brace' },
  yaml: { kind: 'yaml', shape: 'language', label: 'Y' }, yml: { kind: 'yaml', shape: 'language', label: 'Y' },
  toml: { kind: 'toml', shape: 'config' }, ini: { kind: 'config', shape: 'config' }, cfg: { kind: 'config', shape: 'config' }, conf: { kind: 'config', shape: 'config' }, properties: { kind: 'config', shape: 'config' }, env: { kind: 'env', shape: 'config' },
  html: { kind: 'html', shape: 'code' }, htm: { kind: 'html', shape: 'code' }, xhtml: { kind: 'html', shape: 'code' }, xml: { kind: 'xml', shape: 'code' }, xsl: { kind: 'xml', shape: 'code' },
  vue: { kind: 'vue', shape: 'language', label: 'V' }, svelte: { kind: 'svelte', shape: 'language', label: 'S' },
  css: { kind: 'css', shape: 'language', label: '#' }, scss: { kind: 'scss', shape: 'language', label: 'S' }, sass: { kind: 'scss', shape: 'language', label: 'S' }, less: { kind: 'less', shape: 'brace' },
  sh: { kind: 'shell', shape: 'terminal' }, bash: { kind: 'shell', shape: 'terminal' }, zsh: { kind: 'shell', shape: 'terminal' }, fish: { kind: 'shell', shape: 'terminal' }, bat: { kind: 'powershell', shape: 'terminal' }, cmd: { kind: 'powershell', shape: 'terminal' }, ps1: { kind: 'powershell', shape: 'terminal' },
  sql: { kind: 'database', shape: 'database' }, db: { kind: 'database', shape: 'database' }, sqlite: { kind: 'database', shape: 'database' }, sqlite3: { kind: 'database', shape: 'database' }, ipynb: { kind: 'notebook', shape: 'notebook' },
  pdf: { kind: 'pdf', shape: 'office', label: 'PDF' }, doc: { kind: 'word', shape: 'office', label: 'W' }, docx: { kind: 'word', shape: 'office', label: 'W' }, rtf: { kind: 'word', shape: 'office', label: 'W' }, ppt: { kind: 'slides', shape: 'office', label: 'P' }, pptx: { kind: 'slides', shape: 'office', label: 'P' }, xls: { kind: 'sheet', shape: 'sheet', label: 'X' }, xlsx: { kind: 'sheet', shape: 'sheet', label: 'X' }, csv: { kind: 'sheet', shape: 'sheet', label: 'C' }, tsv: { kind: 'sheet', shape: 'sheet', label: 'T' },
  png: { kind: 'image', shape: 'image' }, jpg: { kind: 'image', shape: 'image' }, jpeg: { kind: 'image', shape: 'image' }, gif: { kind: 'image', shape: 'image' }, webp: { kind: 'image', shape: 'image' }, bmp: { kind: 'image', shape: 'image' }, svg: { kind: 'svg', shape: 'image' }, ico: { kind: 'image', shape: 'image' }, avif: { kind: 'image', shape: 'image' },
  mp3: { kind: 'audio', shape: 'audio' }, wav: { kind: 'audio', shape: 'audio' }, m4a: { kind: 'audio', shape: 'audio' }, ogg: { kind: 'audio', shape: 'audio' }, flac: { kind: 'audio', shape: 'audio' }, mp4: { kind: 'video', shape: 'video' }, mov: { kind: 'video', shape: 'video' }, avi: { kind: 'video', shape: 'video' }, mkv: { kind: 'video', shape: 'video' }, webm: { kind: 'video', shape: 'video' },
  zip: { kind: 'archive', shape: 'archive' }, rar: { kind: 'archive', shape: 'archive' }, '7z': { kind: 'archive', shape: 'archive' }, tar: { kind: 'archive', shape: 'archive' }, gz: { kind: 'archive', shape: 'archive' }, bz2: { kind: 'archive', shape: 'archive' },
  epub: { kind: 'epub', shape: 'book' }, mobi: { kind: 'epub', shape: 'book' }, eml: { kind: 'mail', shape: 'mail' }, msg: { kind: 'mail', shape: 'mail' }, rss: { kind: 'rss', shape: 'language', label: '◔' }, atom: { kind: 'rss', shape: 'language', label: '◔' },
  ttf: { kind: 'font', shape: 'font' }, otf: { kind: 'font', shape: 'font' }, woff: { kind: 'font', shape: 'font' }, woff2: { kind: 'font', shape: 'font' }, exe: { kind: 'binary', shape: 'binary' }, dll: { kind: 'binary', shape: 'binary' }, bin: { kind: 'binary', shape: 'binary' }, wasm: { kind: 'wasm', shape: 'binary' },
};

const exactNameIcons: Record<string, FileIconDescriptor> = {
  'cargo.lock': { kind: 'cargo', shape: 'lock' }, 'cargo.toml': { kind: 'cargo', shape: 'package' },
  'changelog.md': { kind: 'changelog', shape: 'document' },
  'docker-compose.yaml': { kind: 'docker', shape: 'docker' }, 'docker-compose.yml': { kind: 'docker', shape: 'docker' }, dockerfile: { kind: 'docker', shape: 'docker' },
  license: { kind: 'license', shape: 'document' }, 'license.md': { kind: 'license', shape: 'document' }, makefile: { kind: 'makefile', shape: 'config' },
  'package-lock.json': { kind: 'npm', shape: 'lock' }, 'package.json': { kind: 'npm', shape: 'package' }, 'pnpm-lock.yaml': { kind: 'pnpm', shape: 'lock' },
  'readme.md': { kind: 'readme', shape: 'book' }, 'readme.markdown': { kind: 'readme', shape: 'book' },
  'tsconfig.json': { kind: 'typescript', shape: 'config' }, 'vite.config.js': { kind: 'vite', shape: 'config' }, 'vite.config.ts': { kind: 'vite', shape: 'config' }, 'yarn.lock': { kind: 'yarn', shape: 'lock' },
};

export function resolveFileIcon(filename: string): FileIconDescriptor {
  const name = filename.split(/[\\/]/).pop()?.toLowerCase() || filename.toLowerCase();
  const exact = exactNameIcons[name];
  if (exact) return exact;
  if (/^readme(?:\.|$)/.test(name)) return { kind: 'readme', shape: 'book' };
  if (/^(?:\.git|git)/.test(name)) return { kind: 'git', shape: 'git' };
  if (/^\.env(?:\.|$)/.test(name)) return { kind: 'env', shape: 'config' };
  if (/^(?:eslint|prettier|stylelint|babel)(?:\.|$)/.test(name)) return { kind: 'config', shape: 'config' };
  if (/^compose\.(?:yaml|yml)$/.test(name)) return { kind: 'docker', shape: 'docker' };
  if (/^(?:package|pnpm-workspace)\.(?:json|yaml|yml)$/.test(name)) return { kind: 'npm', shape: 'package' };
  const extension = name.includes('.') ? name.split('.').pop() || '' : '';
  return languageIcons[extension] || extensionIcons[extension] || { kind: 'document', shape: 'document' };
}
