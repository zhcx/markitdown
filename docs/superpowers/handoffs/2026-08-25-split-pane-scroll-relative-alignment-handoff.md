# 分栏同步滚动相对对齐 Handoff

日期：2026-08-25

## 接力目标

本交接记录 `perf/split-pane-scroll` 分支上已完成的三项改动：定位框边距美化、同步滚动由绝对对齐改为相对对齐、放弃预览框顶部高度调整。接手者只需做浏览器验收、确认无回归即可继续后续性能优化任务，不要重做已完成改动。

## 工作区快照

- 仓库：`D:\Documents\code\zeditor`
- 当前分支：`perf/split-pane-scroll`
- 工作区类型：普通 Git checkout，不是 linked worktree
- 最新提交：由本次改动产生的 `fix: 分栏同步滚动改为相对对齐并恢复预览顶部布局`（及后续 docs 提交）

## 本次改动摘要

### 1. 定位框边距增加（美化）

文件：`src/styles/main.css`

`.preview-document .is-active-source-block::before`（预览区当前源行左侧定位竖条）的 `top`/`bottom` 从 `3px` 增至 `6px`，竖条两端内缩、视觉上更透气美观。

### 2. 同步滚动定位改为相对对齐

文件：`src/App.tsx`、`src/utils/scrollSync.ts`（未改，仅保留导出）

`alignEditorLineWithPreview` 弃用 `getAlignedScrollTop` 的绝对像素对齐（此前会把目标行精确滚动到容器屏幕坐标，受两栏顶部内边距/工具栏差异影响产生偏差），改为通过共享行锚点 `getSyncedScrollTop` 做相对映射：

- `editor-to-preview`：`getSyncedScrollTop(editorViewport, previewViewport, editorToPreviewAnchors, editorToPreviewRange)`
- `preview-to-editor`：`getSyncedScrollTop(previewViewport, editorViewport, previewToEditorAnchors, previewToEditorRange)`

同步点不再是“绝对屏幕位置”，而是锚点插值/比例映射，定位偏差消除。`getAlignedScrollTop` 保留在 `scrollSync.ts` 中（`tests/scrollSync.test.ts` 仍覆盖），但 `App.tsx` 不再使用。

相关接口调整：

- `revealPreviewLineRef` / `revealEditorLineRef` 类型由 `(lineNumber: number) => void` 改为 `() => void`（相对对齐不需要行号）。
- `handleEditorLineReveal` / `handlePreviewSourceClick` 调用处同步去掉行号实参。
- `findActiveSourceElement` 仍在 `handleEditorLineReveal` 中用于可见性判断，导入保留。

### 3. 放弃预览框顶部高度调整

文件：`src/App.tsx`、`src/styles/main.css`

回退提交 `231f085 fix: 对齐编辑区与预览区内容基线` 中针对预览侧的两处顶部补偿：

- 删除 `App.tsx` 中的 `<div className="preview-mode-row-spacer" />`。
- 删除 `.preview-mode-row-spacer` 规则。
- 删除 `.preview-workspace-pane .preview-document { padding-top: var(--document-content-top-padding); }` 规则。

保留项（编辑器侧自身布局，不属于“预览框顶部高度调整”）：

- `.editor-mode-row` 及其 `--editor-mode-row-height: 31px`。
- `.block-editor-scroll` 的 `var(--document-content-top-padding, 32px)` 顶部内边距。
- `.main-content.split` 中的两个 CSS 变量定义。

## 测试契约更新

文件：`tests/splitPanePerformanceContract.test.ts`

- 原“split editor and preview reserve the same mode row and content top inset”改为“editor mode row keeps its fixed height while the preview uses relative scroll sync”：保留编辑器模式行/变量断言，新增 `doesNotMatch` 断言确保预览不再有 spacer 与强制顶部内边距。
- 原“alignment variables resolve to the same numeric heights on both panes”改为“editor tokens stay pixel-based and the preview no longer forces a top inset”：只验证编辑器侧 token，断言 `.preview-mode-row-spacer` 与 `.preview-workspace-pane .preview-document` 的 `padding-top` 已不存在。

## 验证证据

在 `D:\Documents\code\zeditor` 执行：

```powershell
npm run lint
```

结果：通过，无 error。

```powershell
npm test
```

结果：239/239 通过，0 failed。

```powershell
npm run build
```

结果：TypeScript 编译 + Vite 生产构建成功（约 3.2s）。

## 浏览器验收要求

使用长混合 Markdown 文档在分栏模式下验证：

- 编辑光标移动/点击预览行时，预览定位竖条与编辑行保持稳定对应，无像素级跳动或回弹。
- 双向滚动逐帧跟随，定位偏差消失（此前的偏差源于绝对对齐叠加顶部内边距）。
- 定位框（`.is-active-source-block`）左侧竖条上下边距增大，视觉更协调。
- 表格、任务列表、代码块、Mermaid、公式、HTML 保真块和图片不破坏同步。
- 浏览器 errors 为空，无 Vite overlay。

## 后续任务顺序

1. 浏览器验收上述清单。
2. 如需继续性能优化，参照 `docs/superpowers/plans/2026-08-25-split-pane-scroll-performance.md` 剩余任务。
3. 若需打包测试：`npm run tauri build`；打包注意见下。

## 打包注意

用户经常在构建后立即运行 `target*/release/zeditor.exe`，会导致 Windows `os error 32` 文件锁。如二进制被运行，复制已编译 exe 到另一个新目录后执行 `npx tauri bundle --bundles msi nsis`，不要强制结束用户进程，以免丢失未保存内容。

## 近期相关提交

```text
（本次）
docs: 交接分栏同步滚动相对对齐改动
fix: 分栏同步滚动改为相对对齐并恢复预览顶部布局

f95a7bb test: 对齐契约断言解析后的共享 CSS 变量值
1a1747d fix: 使拖拽挂起状态跨 effect 重跑存活并修复 4 项审查发现
a29780f fix: 几何失效改为 debounce 而非 throttle
82ceba6 fix: 以 ref 承载拖拽帧任务并通过 quality gate
28e0624 fix: 修正分栏拖拽映射以指针相对主内容为准
231f085 fix: 对齐编辑区与预览区内容基线（本次已回退其预览侧顶部补偿）
```

## 恢复阅读命令

```powershell
Get-Content -Raw -Encoding UTF8 'docs\superpowers\handoffs\2026-08-25-split-pane-scroll-relative-alignment-handoff.md'
Get-Content -Raw -Encoding UTF8 'docs\superpowers\specs\2026-08-25-split-pane-scroll-performance-design.md'
Get-Content -Raw -Encoding UTF8 'docs\superpowers\plans\2026-08-25-split-pane-scroll-performance.md'
```
