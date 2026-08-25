# 完整 Markdown 与块编辑兼容设计

日期：2026-08-25

## 目标

Zeditor 应允许任何 Markdown 文档进入块编辑模式。常见结构提供原生块编辑体验；复杂扩展和未知语法使用可编辑的原始 Markdown 块保真承载。Markdown 继续是唯一持久化格式，现有保存、预览、AI、WebDAV 和 S3 链路保持不变。

## 产品边界

### 原生结构化块

- 段落与一至六级标题
- 无序列表、有序列表、任务列表
- 引用、代码块、分隔线
- 图片和常见行内标记
- GFM 表格，包括表头、数据行和左/中/右对齐

### 原始 Markdown 块

- Mermaid 围栏代码
- 块公式和含行内公式的顶层段落
- HTML 块和含行内 HTML 的顶层段落
- `details`/`summary`
- 脚注定义和含脚注引用的顶层段落
- 视频宏、TOC 和其他 Zeditor 扩展
- 当前解析器无法安全结构化的未知顶层语法

原始块在编辑区显示语法类型和源码正文。正文可直接编辑，但不会在编辑区执行 HTML、脚本、Mermaid 或公式；这些内容只在现有预览管线中渲染。

## 方案选择

### 方案 A：所有语法独立可视化编辑器

每种扩展都实现专用节点、命令、交互和序列化器。体验最佳，但实现周期长，第三方扩展无法穷举，容易产生丢失语法细节的转换。

### 方案 B：结构化块加原始块

标准结构使用原生节点，复杂和未知语法使用保真原始块。它能够覆盖开放式 Markdown 生态，同时把损坏文档的风险限制在可测试的分段和拼接边界。本设计采用此方案。

### 方案 C：发现扩展后整篇回退源码模式

实现简单且安全，但不能满足“已有 Markdown 使用块编辑”的要求，也会继续产生当前的模式割裂。

## 架构

### 1. 文档分段器

新增 `src/utils/markdownBlockSegments.ts`，输入完整 Markdown，输出有序的顶层分段：

```ts
export type MarkdownBlockSegment =
  | { kind: 'structured'; source: string; from: number; to: number }
  | { kind: 'raw'; rawKind: RawMarkdownKind; source: string; from: number; to: number };
```

分段器首先使用 markdown-it token 的 `map` 定位顶层块，再使用窄范围扫描器补充 markdown-it 不认识的扩展。检测优先级为：围栏代码、HTML/details、块公式、脚注定义、视频/TOC、含行内扩展的段落、普通结构。

相邻普通分段合并后交给结构化解析器。原始分段保留其非空源码正文；块与块之间的分隔空行由统一文档序列化器规范为一个空行。原始块正文内部的空格、换行、标记和大小写不得修改。

### 2. ProseMirror schema

在 `blockSchema.ts` 中增加：

- `table`：顶层块，包含一个或多个 `table_row`。
- `table_row`：包含一个或多个 `table_cell`。
- `table_cell`：行内内容，属性包括 `header` 和 `align`。
- `raw_markdown`：顶层文本块，属性 `kind`，正文为 `text*`，禁用 marks。

`raw_markdown` 的 DOM 使用 `<pre data-raw-markdown-kind="..."><code>...</code></pre>`。节点外壳显示类型标签和“源码保真”状态，但内容仍由 ProseMirror 管理，避免 React 与 ProseMirror 争夺 DOM。

### 3. 解析与序列化

`parseMarkdown()` 不再因已知扩展直接返回 source mode。它调用分段器，并按顺序构造一个 ProseMirror document：

1. structured 分段通过现有 `MarkdownParser` 解析。
2. GFM table token 映射到表格节点。
3. raw 分段创建 `raw_markdown` 节点。
4. 任一 structured 分段解析失败时，仅将该分段降级为 `raw_markdown`，而不是降级整篇文档。

`serializeMarkdown()` 按顶层节点顺序输出：

- 结构化节点使用现有规范序列化器。
- 表格输出 GFM 表格，保留列对齐语义。
- 原始节点直接输出正文，不转义、不格式化。
- 顶层块之间使用一个空行，文件末尾保留一个换行。

只有 schema 无法创建合法 document 或输入不是字符串时，才返回完整源码模式错误。普通未知 Markdown 不再触发整篇回退。

### 4. 能力检测

`inspectMarkdownCapability()` 改为报告兼容策略，而不是简单支持/不支持：

```ts
export interface MarkdownCapability {
  supported: boolean;
  unsupported: UnsupportedMarkdownKind[];
  rawKinds: RawMarkdownKind[];
  message: string;
}
```

当所有内容都能被结构化或原始块承载时，`supported` 为 `true`。`rawKinds` 用于 UI 标签和诊断，不阻止块模式。`unsupported` 只保留真正无法安全承载的输入错误。

### 5. 编辑器交互

- 新建空文档显示“开始写作，输入 / 打开命令”占位提示。
- 表格单元格可直接输入、选择和使用行内格式。
- 原始块允许多行源码编辑，Enter 在块内插入换行；退出块使用方向键或鼠标。
- Slash 命令插入表格、Mermaid、公式、HTML 模板、视频和 TOC 后仍停留在块模式。
- 块菜单对原始块提供复制、删除和“在源码模式中精确编辑”入口，不把原始块强制转换为普通段落。
- 编辑器/预览滚动同步继续使用顶层 `data-source-line`；表格和原始块各作为一个顶层锚点。

## 安全

- `raw_markdown` 在编辑 DOM 中只输出文本，不使用 `innerHTML`。
- HTML、Mermaid 和公式仅通过现有 Preview 管线渲染。
- Preview 继续调用 `sanitizeRenderedHtml()`；HTML 中的脚本、事件属性和危险 URL 不得绕过清洗。
- 序列化器不得执行或解释原始块内容。
- 日志和错误信息不得包含完整文档或原始块正文。

## 错误恢复

- 单个分段解析失败：转换为 `raw_markdown`，保留该分段源码。
- 表格行列不规则：保留为 `raw_markdown`，不自动补列。
- 原始块编辑后形成可结构化语法：本次编辑仍保持原始块；重新打开文档时可重新分类，避免输入过程中节点类型跳变。
- 整篇初始化失败：保留 Store 中 Markdown，显示紧凑恢复提示，并允许进入 Monaco 源码模式。

## 测试策略

### 单元测试

- GFM 表格解析、对齐、编辑后序列化。
- Mermaid、HTML、块公式、行内公式、Details、脚注、视频和 TOC 分段。
- 未知扩展进入原始块。
- 原始块正文不转义、不丢换行。
- 混合文档保持顶层顺序和语义。
- 不规则表格降级为原始块。

### 集成测试

- 新建标签页显示占位提示并可立即输入。
- 打开包含表格和扩展语法的现有 Markdown 时进入块模式。
- Slash 插入复杂语法后不切换源码模式。
- 块编辑保存后仍经过 dirty、本地保存、WebDAV 和 S3 链路。
- 编辑器与预览双向滚动覆盖表格和原始块。
- 标签切换和外部 Markdown 更新不重建等价文档。

### 浏览器与桌面验证

- 深色和浅色主题下检查表格、原始块、占位提示和定位侧线。
- 使用混合语料执行编辑器到预览、预览到编辑器滚动。
- Windows Tauri 构建后打开真实文件，验证保存、重开和源码模式往返。

## 兼容语料

验收语料必须包含一个混合文档，依次包含：标题、普通段落、对齐表格、任务列表、Mermaid、块公式、行内公式、HTML、Details、脚注、视频宏、TOC 和未知围栏语言。保存并重开后，各块顺序、可见正文和原始扩展源码必须保持一致。

## 非目标

- 本阶段不实现公式可视化编辑器、Mermaid 图形拖拽编辑器或 HTML 所见即所得编辑器。
- 不执行原始 HTML 或脚本。
- 不承诺保留结构化块的原始空格风格；结构化块继续输出规范 Markdown。
- 不新增 `.zdoc` 或其他持久化格式。
