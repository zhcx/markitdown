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
 * 使用 Monaco 传统输入路径（textarea）而非实验性的原生 EditContext。
 * WebView2 下 EditContext 路径存在渲染回归：打字时光标所在行的文本会
 * 被绘制到编辑器顶部空白处（一个 lineHeight 之上），回车触发重排后才
 * 归位。配合 main.css 中对输入承载层的可见性兜底（见 .monaco-host
 * 输入层规则），中文 IME 组合期"整行未换行复制到顶部"的旧问题也一并被
 * 掩蔽。
 */
export const EDITOR_INPUT_OPTIONS = {
  editContext: false,
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
