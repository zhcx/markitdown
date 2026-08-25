# 分栏对齐与滚动性能优化 Handoff

日期：2026-08-25

## 接力目标

继续实施“编辑区/预览区首块精确同高、双向逐帧滚动同步、实时分栏拖动降卡顿”计划。不要重做已完成的设计、计划和 Task 1。

## 工作区快照

- 仓库：`D:\Documents\code\zeditor`
- 当前分支：`fix/block-editor-reliability-command-center`
- 工作区类型：普通 Git checkout，不是 linked worktree
- 用户已明确选择：在当前专用 feature 分支原目录继续，不创建新 worktree
- 最新已提交实现：`231f085 fix: 对齐编辑区与预览区内容基线`
- 当前工作树：存在 2 个未跟踪文件，均属于 Task 2

```text
?? src/utils/paneInteraction.ts
?? tests/paneInteraction.test.ts
```

不要删除、覆盖或重新生成这两个文件；先验证并提交。

## 已确认的产品与技术决策

用户在 brainstorming 中逐项确认：

1. 分栏拖动采用“实时跟随”，内容随分隔条实时换行，不采用松手后才改变宽度的幽灵分隔线。
2. 双向滚动采用逐帧实时同步，不采用停止约 80ms 后再对齐。
3. 优化方案采用“热路径隔离”：每帧只处理最新请求，拖动期间暂停昂贵锚点几何扫描，松手后一次校准。
4. 视觉方案选择 A：编辑区与预览区首个内容块精确同高，误差目标不超过 1px。
5. 不引入文档虚拟化、内容快照、transform 缩放或模糊拖动层。

## 规格与计划

- 设计：`docs/superpowers/specs/2026-08-25-split-pane-scroll-performance-design.md`
  - 提交：`927dd53 docs: 设计分栏与滚动性能优化`
- 实施计划：`docs/superpowers/plans/2026-08-25-split-pane-scroll-performance.md`
  - 提交：`e07ecde docs: 编写分栏与滚动性能实施计划`

执行方式：用户选择“当前会话执行 / executing-plans”。接力智能体应继续逐任务 TDD、验证、提交。

## 已完成

### Task 1：对齐编辑区与预览区内容基线

提交：

- `231f085 fix: 对齐编辑区与预览区内容基线`

改动：

- 新增 `tests/splitPanePerformanceContract.test.ts`。
- `Editor.tsx` 使用固定高度 `.editor-mode-row` 包裹模式切换按钮。
- 预览工作区新增 `.preview-mode-row-spacer`。
- 分屏定义共享变量：
  - `--editor-mode-row-height: 31px`
  - `--document-content-top-padding: 32px`
- 块编辑器和分屏预览使用相同正文顶部内边距。
- 更新既有块布局契约，使其验证 CSS 变量而非硬编码 `32px`。

验证：

```text
tests/splitPanePerformanceContract.test.ts
tests/blockEditorNavigation.test.ts
tests/blockEditorUiContract.test.ts
```

结果：15/15 通过。

## 当前进行中

### Task 2：确定性的最新动画帧调度器

当前未提交文件：

- `src/utils/paneInteraction.ts`
- `tests/paneInteraction.test.ts`

已实现 API：

- `FrameDriver`
- `LatestFrameTask<T>`
- `browserFrameDriver`
- `createLatestFrameTask<T>()`
- `hasMeaningfulPixelDelta()`

已完成红绿循环：

1. 测试先因 `paneInteraction.ts` 不存在而失败。
2. 最小实现写入后重新运行：

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --test tests/paneInteraction.test.ts
```

结果：3/3 通过。

覆盖行为：

- 同一动画帧只执行最新值。
- `flush()` 同步提交最后待处理值且不会重复执行。
- `cancel()` 清除待处理帧。
- 小于 1px 的变化被忽略，达到 1px 才更新。

## 接力后的第一步

先执行：

```powershell
Set-Location 'D:\Documents\code\zeditor'
git status --short --branch
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --test tests/paneInteraction.test.ts
git diff --check
```

确认 3/3 通过后，只提交 Task 2 文件：

```powershell
git add src/utils/paneInteraction.ts tests/paneInteraction.test.ts
git commit -m "perf: 增加最新动画帧调度器"
```

然后从实施计划 Task 3 继续：将实时分栏拖动接入 `createLatestFrameTask`，不要跳到 Task 5。

## 后续任务顺序

1. Task 3：将实时分栏拖动接入帧调度器。
2. Task 4：实现可暂停几何失效控制器。
3. Task 5：隔离滚动同步与分栏几何工作。
4. Task 6：更新性能文档并做浏览器验收。
5. Task 7：全量测试、Lint、生产构建、Rust 检查、代码审查和隔离目录打包。

每个任务必须遵循：写失败测试 → 确认预期失败 → 最小实现 → 聚焦测试通过 → 独立提交。

## 最新验证证据

开始本轮实施前运行：

```powershell
npm test
```

结果：225/225 通过，0 failed。

Task 1 修改后只运行了聚焦测试（15/15），尚未重新运行全量测试。

Task 2 当前聚焦测试：3/3 通过。

不要把“实施前全量通过”误写成“当前未提交状态全量通过”；下一次全量质量门应按 Task 7 执行，若中途出现跨模块风险也可提前执行。

## 近期相关提交

```text
231f085 fix: 对齐编辑区与预览区内容基线
e07ecde docs: 编写分栏与滚动性能实施计划
927dd53 docs: 设计分栏与滚动性能优化
1cedb37 fix: 保持时间线标题单行显示
31e425f fix: 加固预览任务列表交互
b3e644b fix: 支持预览区点击任务列表
84d6de4 fix: 支持点击切换任务列表状态
```

## 性能根因证据

现有代码已使用 `requestAnimationFrame`，但仍有以下热点：

- 主分栏拖动每次真实宽度变化都会触发 Monaco、ProseMirror/块编辑 DOM 和预览文档换行布局。
- `ResizeObserver` 的锚点刷新会遍历全部 `[data-source-line]` 并调用 `getBoundingClientRect()`。
- 当前拖动结束可能在待执行动画帧前清空指针请求，丢失最后位置。
- 滚动和拖动各自维护一套手写 pending/frame refs，缺少可单测的统一最新请求语义。

计划通过调度器、1px 阈值、拖动期间暂停几何失效、松手后一次刷新来解决；不要改成虚拟化或停止后同步。

## 浏览器验收要求

最终需使用长混合 Markdown 文档验证：

- 编辑区与预览区首块顶部差值 `<= 1px`。
- 编辑→预览、预览→编辑均逐帧跟随，无回弹和延迟追赶。
- 突发多次 `mousemove` 后最终分隔条位置等于最后 `clientX`。
- 拖动期间 `[data-source-line]` 的 `getBoundingClientRect()` 调用数为 0；松手后只出现一次合并刷新。
- 表格、任务列表、代码块、Mermaid、公式、HTML 保真块和图片不破坏同步。
- 浏览器 errors 为空，无 Vite overlay。

## 打包注意

用户经常在构建后立即运行 `target*/release/zeditor.exe`，会导致 Windows `os error 32` 文件锁。最终打包必须使用新的隔离目标目录；如二进制被运行，复制已编译 exe 到另一个新目录后执行 `npx tauri bundle --bundles msi nsis`，不要强制结束用户进程，以免丢失未保存内容。

之前生成的安装包不包含本轮性能优化，均视为过期。

## 恢复阅读命令

```powershell
Get-Content -Raw -Encoding UTF8 'docs\superpowers\handoffs\2026-08-25-split-pane-scroll-performance-handoff.md'
Get-Content -Raw -Encoding UTF8 'docs\superpowers\specs\2026-08-25-split-pane-scroll-performance-design.md'
Get-Content -Raw -Encoding UTF8 'docs\superpowers\plans\2026-08-25-split-pane-scroll-performance.md'
```

从 Task 2 提交开始接力，不要重做 brainstorming、规格、计划或 Task 1。
