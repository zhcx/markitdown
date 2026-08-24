# 块编辑器可靠性与统一命令中心 Handoff

日期：2026-08-24

## 工作区快照

- 仓库：`D:\Documents\Code\zeditor`
- 隔离 worktree：`D:\Documents\Code\zeditor\.worktrees\block-editor-reliability-command-center`
- 开发分支：`fix/block-editor-reliability-command-center`
- 基线提交：`68eaad1 docs: 编写块编辑器修复实施计划`
- 当前提交：`eea0283 fix: 补全块编辑器历史快捷键与生命周期测试`
- 上游远程：`origin https://github.com/zhcx/zeditor.git`
- 当前工作树：干净

设计文档：

- `docs/superpowers/specs/2026-08-24-block-editor-reliability-command-center-design.md`

实施计划：

- `docs/superpowers/plans/2026-08-24-block-editor-reliability-command-center.md`

## 已确认的产品决策

- 采用“稳定编辑内核 + 实时文档桥 + 统一命令注册表”方案。
- `/` 菜单统一显示块、格式、媒体和 AI 编辑命令。
- AI 对选区或当前块执行，结果必须经过现有差异确认框才写入。
- 编辑区采用 20–48px 自适应横向留白，正文最大宽度约 980px。
- 预览当前位置采用 2px 微弱侧线和约 5% 强调色背景。
- Markdown 继续作为唯一持久化格式；复杂 Markdown 无损回退源码模式。

## 已完成

### Task 1：实时块文档桥

状态：规格审查通过，代码质量审查通过。

提交：

- `23782d4 fix: 同步块文档快照与源行映射`
- `8e06666 fix: 修正块文档同步身份与快照一致性`

结果：

- 新增 `BlockDocumentBridge`，统一维护 ProseMirror document、Markdown、`BlockSourceMap` 和版本号。
- 控制器所有读取路径使用实时快照。
- `syncDocument()` 无参数，只能同步当前 `view.state.doc`，避免文档与位置映射错配。
- 使用引用相等和 `Node.eq()` 判断文档变化，避免不必要的全量序列化。
- 增加真实 transaction、选区/坐标映射和结构不同但 Markdown 相同的回归测试。

### Task 2：稳定挂载与键盘编辑

状态：规格审查通过，最终代码质量审查通过；无 Critical/Important 遗留问题。

提交：

- `79fc83c fix: 稳定块编辑挂载与键盘输入`
- `36935e8 fix: 修复块编辑器键盘与生命周期边界`
- `eea0283 fix: 补全块编辑器历史快捷键与生命周期测试`

结果：

- ProseMirror 挂载节点改为 React 声明式稳定宿主，移除命令式 `createElement`/`appendChild`/`remove`。
- 编辑器创建只受挂载和模式边界控制，回调通过 ref 更新，不因回调身份变化重建视图。
- 外部支持的 Markdown 更新后立即刷新实时控制器快照。
- Enter 支持普通段落、无序列表、有序列表和任务列表拆分。
- Shift+Enter 在普通块插入 hard break，在代码块使用 `newlineInCode`。
- 已完成任务拆分后，新任务默认未完成。
- Backspace 将空标题和空代码块恢复为正文。
- 显式绑定 `Mod-z`、`Shift-Mod-z`、`Mod-y` 撤销/重做。
- 新增真实 JSDOM 生命周期测试，验证挂载、回调 rerender、外部 Markdown、控制器身份、历史和卸载清理。

## 最新验证证据

在提交 `eea0283` 上重新执行：

- `npm test`：191/191 通过，0 failed。
- `npm run lint`：退出码 0。
- `npm run build`：退出码 0，Vite production build 完成。

测试中有一条非失败警告：

```text
Warning: --localstorage-file was provided without a valid path
```

该警告来自 Node/JSDOM 测试环境，不影响当前 191 项测试结果。

## 当前改动范围

相对基线 `68eaad1`：

- 修改 `package.json`、`package-lock.json`，增加窄范围的 JSDOM/TSX 测试依赖。
- 修改 `src/components/Editor/BlockEditor.tsx`。
- 新增 `src/components/Editor/blockKeymap.ts`。
- 新增 `src/utils/blockDocumentBridge.ts`。
- 修改 `src/utils/blockEditorController.ts`。
- 新增并扩展块文档、控制器、键盘和生命周期测试。
- 新增 `tests/helpers/` 下 CSS loader 与 TSX 测试注册脚本。

## 非阻断遗留项

1. `package.json` 声明 Node `>=22.6.0`，而 JSDOM 29 要求 Node `^22.13.0` 或 `>=24`。当前环境为 Node 25.9.0，测试通过。明日继续前决定：提高项目 Node 下限，或改用兼容 Node 22.6 的 JSDOM 版本。
2. 块手柄已从 `aria-hidden` 容器移出，但仍主要通过鼠标发现。键盘入口需要单独确认快捷键或焦点交互，不在已确认设计中擅自新增。
3. Task 3–8 尚未开始；当前版本只完成编辑内核、文档桥和基础键盘行为，还未完成用户要求的留白、预览侧线、统一 `/` 菜单和 AI 命令入口。

## 明日继续顺序

1. 进入隔离 worktree，确认远端分支和干净状态。
2. 处理或记录 Node/JSDOM 下限选择。
3. 从实施计划 Task 3 开始：恢复滚动同步、应用自适应留白和预览微弱侧线。
4. Task 3 完成后继续保持每任务：实现子代理 → 规格审查 → 代码质量审查。
5. 按计划完成 Task 4–7。
6. Task 8 执行全量测试、Lint、构建、桌面冒烟和 Windows 安装包。

## 恢复命令

```powershell
Set-Location 'D:\Documents\Code\zeditor\.worktrees\block-editor-reliability-command-center'
git status --short --branch
git log --oneline -10
npm ci
npm test
```

随后阅读：

```powershell
Get-Content -Raw -Encoding UTF8 'docs\superpowers\handoffs\2026-08-24-block-editor-reliability-command-center-handoff.md'
Get-Content -Raw -Encoding UTF8 'docs\superpowers\plans\2026-08-24-block-editor-reliability-command-center.md'
```

从 Task 3 继续，不重复 Task 1–2。
