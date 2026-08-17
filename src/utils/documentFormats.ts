/**
 * File formats supported by the optional Firecrawl AnyDoc converter.
 * Keep this list aligned with converter/src/main.rs and the module packager.
 */
export const CONVERTIBLE_DOCUMENT_EXTENSIONS = [
  'doc', 'docx', 'docm',
  'ppt', 'pps', 'pot', 'pptx', 'pptm', 'ppsx', 'ppsm',
  'xls', 'xlsx', 'xlsm', 'xlsb',
  'odt', 'ods', 'odp', 'rtf', 'epub', 'csv', 'pdf',
] as const;

export const DIRECTLY_EDITABLE_EXTENSIONS = [
  'md',
  'markdown',
  'mdx',
  'txt',
  'text',
  'json',
  'jsonl',
  'xml',
  'xsl',
  'yaml',
  'yml',
  'toml',
  'csv',
  'tsv',
  'log',
  'diff',
  'patch',
  'ini',
  'cfg',
  'conf',
  'properties',
  'env',
  'c',
  'cc',
  'cpp',
  'cxx',
  'h',
  'hpp',
  'cs',
  'dart',
  'ex',
  'exs',
  'fs',
  'fsx',
  'go',
  'groovy',
  'java',
  'js',
  'cjs',
  'mjs',
  'jsx',
  'jl',
  'kt',
  'kts',
  'lua',
  'php',
  'py',
  'rb',
  'rs',
  'scala',
  'swift',
  'ts',
  'cts',
  'mts',
  'tsx',
  'vb',
  'vue',
  'svelte',
  'css',
  'scss',
  'sass',
  'less',
  'sh',
  'bash',
  'zsh',
  'fish',
  'bat',
  'cmd',
  'ps1',
  'sql',
] as const;

export const OPENABLE_FILE_EXTENSIONS = Array.from(new Set([
  ...DIRECTLY_EDITABLE_EXTENSIONS,
  ...CONVERTIBLE_DOCUMENT_EXTENSIONS,
]));

const convertibleExtensions = new Set<string>(CONVERTIBLE_DOCUMENT_EXTENSIONS);

export function isConvertibleDocumentName(filename: string): boolean {
  const name = filename.split(/[\\/]/).pop()?.toLowerCase() || filename.toLowerCase();
  const extension = name.includes('.') ? name.split('.').pop() || '' : '';
  return convertibleExtensions.has(extension);
}
