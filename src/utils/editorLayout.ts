/**
 * Markdown editing always wraps to the visible viewport. Horizontal scrolling
 * therefore has no useful content to reveal and must not reserve layout space.
 */
export const EDITOR_OVERFLOW_OPTIONS = {
  scrollBeyondLastColumn: 0,
  // Monaco 0.55+ 默认启用 EditContext API（Chromium 121+）。该路径把光标/选区
  // 边界通过 EditContext.updateSelectionBounds/ControlBounds 交给浏览器，再由
  // WebView2 转给 TSF；在 Edge 151 的 WebView2 里存在 IME 组合窗锚点漂移/跳到
  // 首行的问题。强制使用传统的隐藏 textarea 路径，Monaco 自行定位输入承载层，
  // 输入法候选窗跟随更可靠。
  editContext: false,
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
