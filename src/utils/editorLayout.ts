/**
 * Markdown editing always wraps to the visible viewport. Horizontal scrolling
 * therefore has no useful content to reveal and must not reserve layout space.
 */
export const EDITOR_OVERFLOW_OPTIONS = {
  scrollBeyondLastColumn: 0,
  scrollbar: {
    vertical: 'auto',
    useShadows: false,
    horizontal: 'hidden',
    horizontalScrollbarSize: 0,
    verticalScrollbarSize: 10,
    verticalSliderSize: 10,
  },
} as const;

/**
 * Chinese punctuation and typography are normal document content. Monaco's
 * ambiguous-character detector produces a noisy warning banner for these
 * documents, so only genuinely invisible code points remain highlighted.
 */
export const EDITOR_UNICODE_HIGHLIGHT_OPTIONS = {
  nonBasicASCII: false,
  ambiguousCharacters: false,
  invisibleCharacters: true,
  allowedLocales: {
    _os: true,
    _vscode: true,
    'zh-hans': true,
    'zh-hant': true,
  },
} as const;
