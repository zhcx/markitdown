# Notion 式兼容混合块编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 `.md` 文件、现有预览/导出/AI/时间线/WebDAV/S3 链路的前提下，为 Zeditor 增加默认的 Notion 式基础块编辑模式，并对暂不支持的 Markdown 安全降级到 Monaco 源码模式。

**Architecture:** Monaco 继续负责源码模式；新增 ProseMirror 块编辑器负责支持范围内的块树编辑。Markdown 仍是唯一持久化格式，块编辑器通过解析器、序列化器和 `BlockSourceMap` 实现块位置与 Markdown 字符偏移之间的兼容层，继续向现有 `EditorController` 提供同一套 API。

**Tech Stack:** React 18、TypeScript、Zustand、ProseMirror（`prosemirror-model/state/view/commands/keymap/history/inputrules/schema-list/markdown/dropcursor/gapcursor`）、现有 `markdown-it`、Monaco Editor、Node 内置 test runner、Tauri 2。

---

## 实施前的文件职责地图

- `src/components/Editor/Editor.tsx`：编辑器宿主；根据当前标签页模式挂载块编辑器或源码编辑器。
- `src/components/Editor/SourceEditor.tsx`：从现有 `Editor.tsx` 抽出的 Monaco 实现，保留源码模式全部行为。
- `src/components/Editor/BlockEditor.tsx`：ProseMirror 生命周期、块手柄、拖拽、Slash 菜单、模式提示和编辑事件。
- `src/components/Editor/blockSchema.ts`、`blockInputRules.ts`、`blockCommands.ts`：块节点、输入规则和键盘命令，彼此不依赖 React。
- `src/utils/markdownBlockCapability.ts`、`markdownBlockCodec.ts`、`blockSourceMap.ts`：Markdown 能力检测、解析/序列化和源映射；纯函数优先，便于 Node 测试。
- `src/utils/blockEditorController.ts`：把 ProseMirror selection/transaction 映射为既有 `EditorController` 字符偏移 API。
- `src/types/blockEditor.ts`、`src/types/editor.ts`：公开模式、块类型、能力检测结果、源映射和 Controller 扩展类型。
- `src/stores/appStore.ts`、`src/utils/tabPersistence.ts`：标签页的编辑模式与向后兼容；`content` 仍是 Markdown 字符串。
- `src/components/Toolbar/Toolbar.tsx`、`src/utils/slashCommands.ts`、`src/stores/aiStore.ts`：复用现有操作入口，必要时通过 Controller 触发源码降级。
- `src/App.tsx`、`src/utils/scrollSync.ts`、`src/components/Preview/Preview.tsx`：保留分栏同步滚动，并接入块编辑器的源行/块 DOM 锚点。
- `tests/markdownBlockCodec.test.ts`、`blockSourceMap.test.ts`、`blockEditorController.test.ts`、`blockCommands.test.ts`：核心纯逻辑测试；现有集成测试继续覆盖保存和云备份。

## Task 1: 锁定依赖与公共类型

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/types/blockEditor.ts`
- Modify: `src/types/editor.ts`
- Modify: `src/stores/appStore.ts`
- Create: `tests/blockEditorTypes.test.ts`

- [ ] **Step 1: 先写类型契约测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_NODE_TYPES, DEFAULT_BLOCK_EDITOR_MODE } from '../src/types/blockEditor.ts';

test('block MVP exposes only the planned basic node types', () => {
  assert.deepEqual(BLOCK_NODE_TYPES, [
    'paragraph', 'heading', 'bullet_list', 'ordered_list', 'task_list',
    'blockquote', 'code_block', 'horizontal_rule', 'image',
  ]);
  assert.equal(DEFAULT_BLOCK_EDITOR_MODE, 'blocks');
});
```

- [ ] **Step 2: 运行测试确认契约尚未实现**

Run: `node --test tests/blockEditorTypes.test.ts`

Expected: FAIL，提示 `../src/types/blockEditor.ts` 不存在或导出未定义。

- [ ] **Step 3: 安装 ProseMirror 依赖并定义类型**

Run:

```powershell
npm install prosemirror-commands prosemirror-dropcursor prosemirror-gapcursor prosemirror-history prosemirror-inputrules prosemirror-keymap prosemirror-markdown prosemirror-model prosemirror-schema-list prosemirror-state prosemirror-transform prosemirror-view
```

在 `src/types/blockEditor.ts` 中定义以下公共类型，不把 ProseMirror 内部节点类型泄露给 Zustand：

```ts
export type EditorMode = 'blocks' | 'source';
export type BlockNodeType =
  | 'paragraph' | 'heading' | 'bullet_list' | 'ordered_list' | 'task_list'
  | 'blockquote' | 'code_block' | 'horizontal_rule' | 'image';
export type UnsupportedMarkdownKind =
  | 'table' | 'math' | 'mermaid' | 'html' | 'details' | 'footnote'
  | 'video' | 'toc' | 'unknown';
export interface MarkdownCapability {
  supported: boolean;
  unsupported: UnsupportedMarkdownKind[];
  message: string;
}
export interface BlockSourceRange {
  blockId: string;
  type: BlockNodeType;
  sourceFrom: number;
  sourceTo: number;
  lineFrom: number;
  lineTo: number;
}
export interface BlockSourceMap {
  source: string;
  blocks: BlockSourceRange[];
  sourceOffsetForBlock(blockId: string, innerOffset?: number): number;
  blockForSourceOffset(offset: number): BlockSourceRange | undefined;
}
export const BLOCK_NODE_TYPES: BlockNodeType[] = [
  'paragraph', 'heading', 'bullet_list', 'ordered_list', 'task_list',
  'blockquote', 'code_block', 'horizontal_rule', 'image',
];
export const DEFAULT_BLOCK_EDITOR_MODE: EditorMode = 'blocks';
```

将 `Tab` 扩展为 `editorMode?: EditorMode`，保持可选以兼容旧版本地标签页 JSON。`EditorController` 增加 `kind: 'source' | 'blocks'`，其余已有方法和 `state` 结构不删除。

- [ ] **Step 4: 运行类型和契约测试**

Run: `node --test tests/blockEditorTypes.test.ts; npm run build`

Expected: 测试 PASS，TypeScript 编译 PASS；`package-lock.json` 已记录新增依赖。

- [ ] **Step 5: 提交公共契约**

```powershell
git add package.json package-lock.json src/types/blockEditor.ts src/types/editor.ts src/stores/appStore.ts tests/blockEditorTypes.test.ts
git commit -m "feat: define block editor contracts"
```

## Task 2: 实现 Markdown 能力检测、解析和序列化

**Files:**
- Create: `src/utils/markdownBlockCapability.ts`
- Create: `src/utils/markdownBlockCodec.ts`
- Create: `tests/markdownBlockCodec.test.ts`

- [ ] **Step 1: 写解析、降级和往返测试**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMarkdownCapability } from '../src/utils/markdownBlockCapability.ts';
import { parseMarkdown, serializeMarkdown } from '../src/utils/markdownBlockCodec.ts';

test('parses the supported basic block subset', () => {
  const source = '# 标题\n\n- [ ] 待办\n\n> 引用\n\n```ts\nconst x = 1;\n```\n';
  const result = parseMarkdown(source);
  assert.equal(result.capability.supported, true);
  assert.deepEqual(result.blockTypes, ['heading', 'task_list', 'blockquote', 'code_block']);
  assert.equal(serializeMarkdown(result.document), '# 标题\n\n- [ ] 待办\n\n> 引用\n\n```ts\nconst x = 1;\n```\n');
});

test('falls back without rewriting unsupported Markdown', () => {
  const source = '# 保留\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
  const capability = inspectMarkdownCapability(source);
  assert.equal(capability.supported, false);
  assert.deepEqual(capability.unsupported, ['table']);
  assert.equal(parseMarkdown(source).mode, 'source');
  assert.equal(parseMarkdown(source).source, source);
});

test('treats normal fenced code as supported but Mermaid as unsupported', () => {
  assert.equal(inspectMarkdownCapability('```ts\nlet x = 1;\n```').supported, true);
  assert.deepEqual(inspectMarkdownCapability('```mermaid\nflowchart LR\n```').unsupported, ['mermaid']);
});
```

- [ ] **Step 2: 运行测试确认解析器尚未实现**

Run: `node --test tests/markdownBlockCodec.test.ts`

Expected: FAIL，提示能力检测和 Markdown codec 尚未导出。

- [ ] **Step 3: 实现能力检测**

在 `inspectMarkdownCapability(markdown: string)` 中调用项目共享的 `markdown-it` 实例并检查 token：

- `table_open` 映射为 `table`。
- `math_inline`、`math_block` 映射为 `math`。
- `html_block`、`html_inline` 映射为 `html`；`details`/`summary` 标签优先映射为 `details`。
- `footnote_*` 映射为 `footnote`。
- `video` 宏和 `[TOC]` 映射为 `video`/`toc`。
- `fence` 的 `info` 为 `mermaid` 时映射为 `mermaid`，其他围栏代码保持支持。
- 任意未列入支持清单但会改变块结构的 token 映射为 `unknown`。

返回值必须按固定顺序去重，`message` 使用现有中英文 i18n 约定可替换的短文案，不把远端错误或原始 HTML 内容放进提示。

- [ ] **Step 4: 实现 ProseMirror Markdown codec**

在 `markdownBlockCodec.ts` 中导出：

```ts
export interface ParsedMarkdown {
  mode: 'blocks' | 'source';
  source: string;
  capability: MarkdownCapability;
  document: import('prosemirror-model').Node | null;
  blockTypes: BlockNodeType[];
  sourceMap: BlockSourceMap | null;
}

export function parseMarkdown(markdown: string): ParsedMarkdown;
export function serializeMarkdown(document: import('prosemirror-model').Node): string;
```

解析支持的段落、标题、列表、待办、引用、代码块、分隔线、图片和基础行内 mark。每个顶层块生成稳定的 session 内 `blockId`；序列化后通过 `buildBlockSourceMap()` 重新计算源范围，不把 ID 写入 Markdown。

代码块保留语言标识；图片保留 `alt` 和 URL；序列化统一使用 LF、块之间一个空行、文件末尾一个换行。未支持内容不得进入此序列化器。

- [ ] **Step 5: 运行 codec 测试和现有测试**

Run: `node --test tests/markdownBlockCodec.test.ts tests/markdownOutline.test.ts tests/slashCommands.test.ts`

Expected: 新增测试 PASS，现有 Markdown 大纲和 Slash 测试不受影响。

- [ ] **Step 6: 提交 codec**

```powershell
git add src/utils/markdownBlockCapability.ts src/utils/markdownBlockCodec.ts tests/markdownBlockCodec.test.ts
git commit -m "feat: add Markdown block codec"
```

## Task 3: 定义块 schema、输入规则和键盘命令

**Files:**
- Create: `src/components/Editor/blockSchema.ts`
- Create: `src/components/Editor/blockInputRules.ts`
- Create: `src/components/Editor/blockCommands.ts`
- Create: `tests/blockCommands.test.ts`

- [ ] **Step 1: 写命令行为测试**

测试必须覆盖：输入 `# ` 转标题、输入 `- ` 转无序列表、输入 `1. ` 转有序列表、输入 `- [ ] ` 转待办、输入 `> ` 转引用、空列表项 Backspace 退出列表、空段落 Enter 创建段落、顶层块删除后至少保留一个段落。

测试使用 `prosemirror-test-builder` 不新增依赖，直接通过 schema 创建 `EditorState` 和 transaction；每项断言节点类型和文本，不断言 DOM 类名。

- [ ] **Step 2: 运行测试确认命令尚未实现**

Run: `node --test tests/blockCommands.test.ts`

Expected: FAIL，提示 schema 或命令模块不存在。

- [ ] **Step 3: 创建 schema**

`blockSchema.ts` 定义以下节点：

- `doc`：只允许顶层块。
- `paragraph`、`heading(level 1..4)`、`blockquote`、`code_block(params)`、`horizontal_rule`、`image(src, alt, title)`。
- `bullet_list`、`ordered_list(order)`、`list_item`、`task_list`、`task_item(checked)`；列表项允许 paragraph 和嵌套列表。
- `text` 与 `hard_break`。

行内 mark 至少定义 `strong`、`em`、`strike`、`code`、`link(href,title)`。节点名称必须与 `BlockNodeType` 和 codec 中的名称一致。

- [ ] **Step 4: 实现输入规则和命令**

`blockInputRules.ts` 注册：

```text
^(#{1,4})\s$       -> heading(level)
^[-*]\s$           -> bullet_list
^\d+\.\s$         -> ordered_list
^-\s\[([ xX])\]\s$ -> task_list/checked
^>\s$              -> blockquote
^```([\w-]*)\s$    -> code_block(language)
```

`blockCommands.ts` 导出 `createBlockCommands()`，提供 `insertBlock(type)`, `toggleTask()`, `duplicateTopLevelBlock()`, `deleteTopLevelBlock()`, `moveTopLevelBlock(fromIndex,toIndex)` 和 `turnInto(type)`。删除最后一个块时插入空 paragraph；拖拽命令拒绝非顶层节点。

- [ ] **Step 5: 运行命令测试并提交**

Run: `node --test tests/blockCommands.test.ts`

Expected: PASS。

```powershell
git add src/components/Editor/blockSchema.ts src/components/Editor/blockInputRules.ts src/components/Editor/blockCommands.ts tests/blockCommands.test.ts
git commit -m "feat: add block schema and editing commands"
```

## Task 4: 实现 BlockSourceMap 和 EditorController 兼容层

**Files:**
- Create: `src/utils/blockSourceMap.ts`
- Create: `src/utils/blockEditorController.ts`
- Modify: `src/types/editor.ts`
- Create: `tests/blockSourceMap.test.ts`
- Create: `tests/blockEditorController.test.ts`

- [ ] **Step 1: 写源映射测试**

```ts
test('maps Markdown offsets to the containing block and line', () => {
  const map = buildBlockSourceMap('# 标题\n\n正文\n', parsedDocument);
  const paragraph = map.blocks.find(block => block.type === 'paragraph');
  assert.ok(paragraph);
  assert.equal(map.blockForSourceOffset(paragraph.sourceFrom + 1)?.blockId, paragraph.blockId);
  assert.equal(map.sourceOffsetForBlock(paragraph.blockId, 0), paragraph.sourceFrom);
  assert.equal(paragraph.lineFrom, 3);
});
```

Controller 测试还要覆盖：`getValue()` 返回序列化 Markdown、块内选区转换为源偏移、`replaceRange()` 更新 ProseMirror 文档并回调 Markdown、`state.doc.lines` 与 `lineAt()` 与源字符串一致、外部插入表格后触发降级回调。

- [ ] **Step 2: 运行测试确认映射层尚未实现**

Run: `node --test tests/blockSourceMap.test.ts tests/blockEditorController.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 实现 BlockSourceMap**

`buildBlockSourceMap(source, document)` 按序列化结果扫描顶层节点，记录 `sourceFrom/sourceTo`、`lineFrom/lineTo` 和节点类型。`sourceOffsetForBlock` 超出块文本长度时钳制到块末尾；`blockForSourceOffset` 对空行返回前后最近的块，文档为空时返回 `undefined`。

映射不能把 session block ID 写入文件；重新解析或外部替换后重新生成 ID 和映射。

- [ ] **Step 4: 实现 Controller facade**

导出以下工厂函数：

```ts
export interface BlockControllerHost {
  onMarkdownChange(markdown: string): void;
  onUnsupportedMarkdown(capability: MarkdownCapability): void;
  onActiveSourceLine(lineNumber: number): void;
}

export function createBlockEditorController(
  view: import('prosemirror-view').EditorView,
  root: HTMLElement,
  host: BlockControllerHost,
): EditorController;
```

Controller 的 `state.update({ changes })` 先对当前 Markdown 快照做字符替换，再调用 `parseMarkdown`：支持则以单个 ProseMirror transaction 替换文档并恢复映射后的选区；不支持则调用 `onUnsupportedMarkdown`，保留新 Markdown 并由宿主切换到源码模式。`getTopForLineNumber()` 查询映射块的 `[data-block-id]` 元素相对于 `scrollDOM` 的顶部；找不到元素时按滚动比例返回。

- [ ] **Step 5: 运行映射、Controller 和 TypeScript 测试**

Run: `node --test tests/blockSourceMap.test.ts tests/blockEditorController.test.ts; npm run build`

Expected: 新增测试 PASS，公共 `EditorController` 类型编译通过。

- [ ] **Step 6: 提交兼容层**

```powershell
git add src/utils/blockSourceMap.ts src/utils/blockEditorController.ts src/types/editor.ts tests/blockSourceMap.test.ts tests/blockEditorController.test.ts
git commit -m "feat: bridge block positions to Markdown offsets"
```

## Task 5: 拆分 Monaco 并接入 BlockEditor 宿主

**Files:**
- Create: `src/components/Editor/SourceEditor.tsx`
- Create: `src/components/Editor/BlockEditor.tsx`
- Create: `src/components/Editor/EditorModeToggle.tsx`
- Create: `src/components/Editor/EditorUnsupportedNotice.tsx`
- Create: `src/components/Editor/BlockEditor.css`
- Modify: `src/components/Editor/Editor.tsx`
- Modify: `src/App.css`
- Create: `tests/blockEditorUiContract.test.ts`

- [ ] **Step 1: 增加宿主契约测试**

静态契约测试确认：`Editor.tsx` 同时引用 `SourceEditor`、`BlockEditor`、`parseMarkdown` 和 `EditorModeToggle`；`BlockEditor.tsx` 创建 `EditorView`、注册 `dropCursor`/`gapCursor`/`history`、调用 `onMarkdownChange`；`SourceEditor.tsx` 仍创建 Monaco model，语言为 `markdown`。

- [ ] **Step 2: 运行契约测试确认宿主尚未接入**

Run: `node --test tests/blockEditorUiContract.test.ts`

Expected: FAIL，提示新组件或引用不存在。

- [ ] **Step 3: 抽取 SourceEditor**

把现有 `Editor.tsx` 中 Monaco 初始化、Context Menu、选区工具栏、AI companion、图片粘贴、Slash 菜单、字体/主题同步和 Controller 创建逻辑整体移动到 `SourceEditor.tsx`。不要在该步骤改变已有 Monaco 配置或快捷键；`Editor.tsx` 对外的 props 保持现有 `className/style/onActiveLineChange/onActiveLineReveal`。

- [ ] **Step 4: 实现 BlockEditor 生命周期**

`BlockEditor` 接收：

```ts
interface BlockEditorProps {
  markdown: string;
  className?: string;
  onMarkdownChange: (markdown: string) => void;
  onUnsupportedMarkdown: (capability: MarkdownCapability) => void;
  onActiveLineChange?: (lineNumber: number) => void;
  onActiveLineReveal?: (lineNumber: number) => void;
}
```

初始化时执行 `parseMarkdown`；解析失败或返回 `mode: 'source'` 时只渲染 `EditorUnsupportedNotice` 和切换按钮，不创建可编辑块树。ProseMirror root 使用 `.block-editor-scroll`，每个顶层节点添加 `data-block-id`；节点悬停显示 `.block-handle`，复制/删除/拖拽操作调用 `blockCommands`。

ProseMirror transaction 的 `docChanged` 路径必须按以下顺序执行：序列化 → 构建 `BlockSourceMap` → 调用 `onMarkdownChange` → 更新当前源行 → 更新 Zustand 的 `EditorController`。初始化和外部 content 同步不得触发 dirty 回调。

- [ ] **Step 5: 实现模式切换和降级提示**

`Editor.tsx` 作为宿主读取 active tab 的 `editorMode`：`source` 挂载 `SourceEditor`，`blocks` 先调用能力检测再挂载 `BlockEditor`。`EditorModeToggle` 提供源码/块编辑切换；从源码切块前检测失败则阻止切换并显示 `EditorUnsupportedNotice`；块编辑的外部 Markdown 替换不支持时切换到源码并保留完整新内容。

- [ ] **Step 6: 加入块编辑样式**

在 `BlockEditor.css` 中使用既有 `--ui-*` 和 `--font-content-*` 变量，定义：文档内边距、块间距、标题字号、列表缩进、代码块背景、选中块边框、块手柄显隐、拖拽中的半透明状态、Slash 菜单层级和键盘 focus ring。不要新增独立主题颜色；深浅主题只通过现有语义变量适配。

- [ ] **Step 7: 运行 UI 契约、构建和现有测试**

Run: `node --test tests/blockEditorUiContract.test.ts tests/editorLayout.test.ts tests/appearanceSettings.test.ts; npm run build`

Expected: PASS；打开应用后新建空文档默认可见块编辑器，源码模式仍可打开。

- [ ] **Step 8: 提交编辑器宿主**

```powershell
git add src/components/Editor src/App.css tests/blockEditorUiContract.test.ts
git commit -m "feat: add hybrid block editor host"
```

## Task 6: 接入标签页模式、dirty 状态、时间线和保存链路

**Files:**
- Modify: `src/stores/appStore.ts`
- Modify: `src/utils/tabPersistence.ts`
- Modify: `src/App.tsx`
- Modify: `tests/tabPersistence.test.ts`
- Create: `tests/blockEditorSaveIntegration.test.ts`

- [ ] **Step 1: 写向后兼容和保存顺序测试**

测试固定以下行为：缺少 `editorMode` 的旧标签页归一化为 `blocks`；`saveTab` 仍先 `save_file_content` 再异步调用 `webdav_enqueue_backup`/`s3_enqueue_backup`；块编辑回调更新 `content`、当前标签页内容和 `modified`，但初始化解析不创建时间线条目。

- [ ] **Step 2: 运行测试确认标签页尚未支持模式字段**

Run: `node --test tests/tabPersistence.test.ts tests/blockEditorSaveIntegration.test.ts`

Expected: 新增模式断言 FAIL，现有保存顺序断言保持 PASS。

- [ ] **Step 3: 增加 editorMode 的归一化**

为 `Tab` 增加 `editorMode?: EditorMode`；`addTab` 默认写入 `blocks`；旧标签页读取时使用 `tab.editorMode === 'source' ? 'source' : 'blocks'`。`setActiveTab`、`openFile`、`saveTab` 和 `closeTab` 不改变当前 `content` 的字符串语义。

- [ ] **Step 4: 接通块事务到现有 setContent 链路**

块编辑器的 `onMarkdownChange` 只调用现有 `useAppStore.getState().setContent(markdown)`，不直接调用 Tauri。保持 `setContent` 负责 active tab 内容、dirty 标记、字数和延迟时间线；保持 `saveTab` 负责本地文件保存和两条异步云备份入队。

为避免初始化误标 dirty，`Editor.tsx` 在 `parseMarkdown` 完成前设置 `initializingRef`，该标记清除前的序列化不得调用 `onMarkdownChange`。

- [ ] **Step 5: 运行保存、标签页和云备份测试**

Run: `node --test tests/tabPersistence.test.ts tests/blockEditorSaveIntegration.test.ts tests/webdavIntegration.test.ts tests/webdavSettings.test.ts`

Expected: 全部 PASS；Rust 云备份代码不需要修改。

- [ ] **Step 6: 提交状态链路**

```powershell
git add src/stores/appStore.ts src/utils/tabPersistence.ts src/App.tsx tests/tabPersistence.test.ts tests/blockEditorSaveIntegration.test.ts
git commit -m "feat: persist editor mode without changing Markdown saves"
```

## Task 7: 复用 Slash、工具栏、右键菜单和 AI 操作

**Files:**
- Modify: `src/utils/slashCommands.ts`
- Modify: `src/components/Editor/SlashCommandMenu.tsx`
- Modify: `src/components/Editor/BlockEditor.tsx`
- Modify: `src/components/Editor/Editor.tsx`
- Modify: `src/components/Toolbar/Toolbar.tsx`
- Modify: `src/stores/aiStore.ts`
- Create: `tests/blockEditorIntegrations.test.ts`

- [ ] **Step 1: 写集成契约测试**

测试确认：现有命令过滤仍按 title/description/shortcut/keywords 工作；基础块命令拥有 `blockAction`；工具栏和 AI 仍只依赖 `EditorController` 的公共方法；表格、公式、Mermaid 命令在块模式触发安全源码降级而不是丢弃插入内容。

- [ ] **Step 2: 为 SlashCommand 增加块动作映射**

保留现有 `insertion` 作为源码模式行为，新增可选的：

```ts
export type BlockSlashAction =
  | { kind: 'turn-into'; type: 'heading'; level: 1 | 2 | 3 | 4 }
  | { kind: 'insert'; type: 'bullet_list' | 'ordered_list' | 'task_list' | 'blockquote' | 'code_block' | 'horizontal_rule' | 'image' };
```

为 `heading-1..4`、`unordered-list`、`ordered-list`、`task-list`、`quote`、`code`、`divider`、`image` 填充映射；`table`、`math`、`mermaid`、`details` 保持无块动作。

- [ ] **Step 3: 在 BlockEditor 中接入 Slash 菜单**

当 ProseMirror 当前 selection 位于空 paragraph 且文本以 `/` 开始时，复用 `filterSlashCommands` 和 `SlashCommandMenu` 的过滤/键盘导航。选择有 `blockAction` 的命令调用 `blockCommands`；没有块动作的命令用当前 Markdown 选择执行 `replaceRange`，由 Controller 触发源码降级并保留插入内容。

- [ ] **Step 4: 保持 Toolbar 和 AI 的 Controller 调用兼容**

优先不改现有 Toolbar/AI 的调用方式：块 Controller 实现 `state.update`, `getSelection`, `getText`, `replaceRange`, `dispatch`, `undo`, `redo`。Toolbar 的源码行格式化、表格和 Mermaid 插入若改变了能力检测结果，宿主切换源码模式；AI 选区替换沿用字符偏移映射。

仅在现有代码直接依赖 Monaco DOM 或 `state.doc` 之外的内部对象时做适配；不得在 `aiStore`、`Toolbar` 中读取 ProseMirror `EditorView`。

- [ ] **Step 5: 运行集成测试和交互检查**

Run: `node --test tests/blockEditorIntegrations.test.ts tests/slashCommands.test.ts tests/agentSupport.test.ts tests/chatHistoryAndContextMenu.test.ts; npm run lint`

Expected: PASS；手动验证 `/h1`、`/todo`、`/quote`、`/code`、AI 选区替换、粗体/斜体和表格插入降级路径。

- [ ] **Step 6: 提交集成层**

```powershell
git add src/utils/slashCommands.ts src/components/Editor src/components/Toolbar/Toolbar.tsx src/stores/aiStore.ts tests/blockEditorIntegrations.test.ts
git commit -m "feat: reuse slash toolbar and AI actions in block mode"
```

## Task 8: 接入大纲、预览回源和分栏滚动同步

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/utils/scrollSync.ts`
- Modify: `src/components/Preview/Preview.tsx`
- Modify: `src/components/Outline/OutlinePanel.tsx`
- Modify: `src/components/Immersive/ImmersiveOutline.tsx`
- Modify: `tests/scrollSync.test.ts`
- Create: `tests/blockEditorNavigation.test.ts`

- [ ] **Step 1: 写导航契约测试**

覆盖以下行为：块 Controller 能按 Markdown 行号返回块顶部；预览标题点击调用 `setSelection(line.from)` 后能聚焦对应块；块模式滚动同步不依赖 `.monaco-editor` 或 `.lines-content`；源码模式继续使用现有 Monaco 行锚点。

- [ ] **Step 2: 抽象滚动视口的可选锚点能力**

保留现有 `ObservableScrollViewport` 方法，新增可选 `getAnchorTop(anchor: { lineNumber: number }): number`。默认实现调用 `getTopForLineNumber`；BlockEditor 的实现使用 `[data-block-id]` 和 `BlockSourceMap`。`App.tsx` 的同步算法继续以最大滚动距离和阈值防抖，删除对 `.lines-content` 必须存在的判断。

- [ ] **Step 3: 让块节点携带源行元数据**

每次序列化后将 `BlockSourceRange.lineFrom` 写入顶层节点 DOM 的 `data-source-line`，同时保留 `data-block-id`。块模式选区变化时调用 `onActiveLineChange`；Preview 继续用既有 `data-source-line` 回调，不新增第二套标题定位协议。

- [ ] **Step 4: 更新大纲和沉浸模式跳转**

大纲仍从 Markdown `content` 调用 `markdownOutline`；跳转通过公共 `EditorController.state.doc.line(line).from` 和 `revealOffset`，不直接访问 Monaco。沉浸阅读保持 Preview，沉浸写作挂载 BlockEditor；源码模式下的原有行为不变。

- [ ] **Step 5: 运行导航测试和手动验收**

Run: `node --test tests/scrollSync.test.ts tests/blockEditorNavigation.test.ts tests/markdownOutline.test.ts tests/headingAnchors.test.ts; npm run build`

Expected: PASS；手动验证长文档中块模式左滚动带动右预览、右侧标题点击回到对应块、侧边大纲点击定位，以及切换源码模式后原有同步仍工作。

- [ ] **Step 6: 提交导航适配**

```powershell
git add src/App.tsx src/utils/scrollSync.ts src/components/Preview/Preview.tsx src/components/Outline/OutlinePanel.tsx src/components/Immersive/ImmersiveOutline.tsx tests/scrollSync.test.ts tests/blockEditorNavigation.test.ts
git commit -m "feat: sync block navigation with Markdown preview"
```

## Task 9: 完成安全降级、恢复和云备份回归

**Files:**
- Modify: `src/components/Editor/EditorUnsupportedNotice.tsx`
- Modify: `src/components/Editor/BlockEditor.tsx`
- Modify: `src/stores/appStore.ts`
- Modify: `tests/webdavIntegration.test.ts`
- Modify: `tests/s3Integration.test.ts`（若文件不存在则创建）
- Create: `tests/blockEditorFallback.test.ts`

- [ ] **Step 1: 写降级和保存回归测试**

测试固定以下场景：

1. 打开含表格的 `.md` 后内容保持原字符串，编辑器模式为 `source`。
2. 块编辑器通过 AI/Toolbar 插入 Mermaid 后，完整字符串仍可在 Monaco 中编辑。
3. 本地保存成功后 WebDAV/S3 只接收序列化后的 Markdown，云端失败不影响本地 dirty 清理。
4. 关闭并重开支持范围内的文档后，块节点类型和文本一致。

- [ ] **Step 2: 实现安全降级提示**

提示组件只显示能力类型和“切换到源码模式”操作；不把原始 HTML、远端响应或密码写入 UI。降级时先写入当前 `content`，再切换标签页模式，避免 React 重挂载丢失最后一次输入。

- [ ] **Step 3: 验证云备份没有新增协议字段**

保持 `saveTab` 中 `save_file_content` 在 `webdav_enqueue_backup`、`s3_enqueue_backup` 之前。新增静态断言检查块模式路径最终仍调用这三个既有入口，不修改 `src-tauri/src/webdav/`。

- [ ] **Step 4: 运行完整前端与 Rust 回归**

Run:

```powershell
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Expected: Node 测试全部 PASS、ESLint PASS、Vite/tsc PASS、Rust 测试 PASS。

- [ ] **Step 5: 提交安全与备份回归**

```powershell
git add src/components/Editor src/stores/appStore.ts tests/blockEditorFallback.test.ts tests/webdavIntegration.test.ts tests/s3Integration.test.ts
git commit -m "test: preserve Markdown and cloud backup fallback paths"
```

## Task 10: 文档、性能和发布验收

**Files:**
- Create: `docs/block-editor.md`
- Modify: `README.md`
- Modify: `docs/performance.md`
- Modify: `CHANGELOG.md`
- Create: `tests/blockEditorDocsContract.test.ts`

- [ ] **Step 1: 写用户文档**

`docs/block-editor.md` 明确说明：块模式支持的语法、Slash/快捷输入、源码模式切换、含高级 Markdown 时的降级行为、保存格式仍为 Markdown、表格/公式/Mermaid 当前进入源码模式。

- [ ] **Step 2: 更新 README 和 CHANGELOG**

在 README 的编辑体验和渲染能力章节补充“兼容混合块编辑器”；在 CHANGELOG 中说明不新增文件格式、不改变 WebDAV/S3 备份对象格式，并列出第一阶段不支持的块类型。

- [ ] **Step 3: 更新性能目标**

在 `docs/performance.md` 增加：支持范围内 100 KB Markdown 首次进入可输入状态 ≤ 1.5 秒；10,000 个块文档不要求一次性完成虚拟化，但连续输入 P95 ≤ 50 ms；1 MB 或能力检测失败的文档自动使用 Monaco 源码模式。记录测量方法：从打开标签页到首次可输入、连续 100 次字符输入的 Performance 记录。

- [ ] **Step 4: 运行文档契约和最终检查**

Run: `node --test tests/blockEditorDocsContract.test.ts; npm test; npm run lint; npm run build; cargo test --manifest-path src-tauri/Cargo.toml --locked`

Expected: 全部 PASS。若执行 Tauri 打包，先关闭运行中的 `zeditor.exe`，打包完成后检查 `src-tauri/Cargo.toml` 没有被构建工具写入非预期行尾变化。

- [ ] **Step 5: 提交文档和发布准备**

```powershell
git add docs/block-editor.md README.md docs/performance.md CHANGELOG.md tests/blockEditorDocsContract.test.ts
git commit -m "docs: document hybrid block editor"
```

## 验收清单

- [ ] 新建、打开、切换标签页时块模式/源码模式状态正确，旧标签页 JSON 可正常读取。
- [ ] 基础块的 Slash、快捷输入、Enter/Backspace、撤销重做、顶层拖拽、复制删除全部可用。
- [ ] 支持范围内 Markdown 的块编辑保存后可重开；不支持范围内 Markdown 始终不被块模式重写。
- [ ] 工具栏、AI、右键菜单、状态栏选区、大纲、预览回源和同步滚动没有因编辑器替换而回归。
- [ ] 本地保存、时间线、WebDAV、S3 仍以 Markdown 为唯一内容输入，云端失败不阻塞本地保存。
- [ ] `npm test`、`npm run lint`、`npm run build` 和 Rust 测试通过；手动验收覆盖深色/浅色主题、键盘导航、中文输入法、图片粘贴和长文档。

## 计划自审

- 设计中的所有 MVP 块类型已由 Task 2、Task 3、Task 5、Task 7 覆盖。
- Markdown 唯一持久化、无 `.zdoc`、无双轨副本已由 Task 1、Task 6、Task 9 固化。
- Monaco 降级、源映射、AI/工具栏兼容、预览同步和云备份回归均有独立任务与测试入口。
- 计划中没有使用 `TBD`、`TODO` 或“稍后补充”等未决占位；不支持的语法集合、模式切换行为和失败路径已经明确。
- `EditorMode`、`BlockNodeType`、`BlockSourceMap`、`BlockControllerHost` 的名称和字段在各任务中保持一致。
