# 块编辑器可靠性与统一命令中心设计

日期：2026-08-24
状态：已确认，待实施计划
适用分支：`feature/notion-block-editor`

## 背景

当前块编辑器已经具备 Markdown 与 ProseMirror 之间的转换、基础块类型、块属性菜单、斜杠菜单和预览同步接口，但测试版本暴露出以下阻断性问题：

1. 块编辑区可能完全失去输入能力，无法编辑、换行或执行块命令。
2. 编辑区和预览区的滚动、光标位置与源行定位不同步。
3. 分栏状态下编辑区左右留白过大，正文可用宽度不足。
4. 预览当前位置使用整块背景和侧边阴影，视觉上接近选中状态，干扰阅读。
5. 现有斜杠菜单只覆盖部分块动作，格式、媒体和 AI 能力没有形成统一入口。

## 根因分析

### React 与 ProseMirror 的 DOM 所有权冲突

`BlockEditor` 当前在 effect 中创建 `editorHost`，再命令式追加到同时由 React 渲染块手柄子节点的 `.block-editor-scroll`。当块手柄、斜杠菜单或其他 React 状态变化时，React 会重新协调该容器的子节点，可能移除或替换不在 React 虚拟树中的 ProseMirror 宿主。编辑视图即使仍持有对象引用，也已脱离可交互 DOM，表现为无法输入、换行和执行命令。

### 控制器文档快照与源行映射过期

`createBlockEditorController` 初始化时保存 `source` 和 `sourceMap`，但用户直接编辑产生 transaction 后只向 Store 发布新的 Markdown，没有同步更新控制器内部快照。随后 selection、`lineAt`、`getTopForLineNumber`、斜杠触发检测和预览锚点仍基于旧文档，导致光标行、滚动同步和命令上下文逐渐失效。

### 视觉参数不适合分栏

块编辑滚动区当前使用 `padding: 32px clamp(32px, 8vw, 120px) 180px`，在半屏宽度下仍会产生明显横向留白。预览当前位置同时使用 10% 强调色背景和 4px 侧边阴影，提示强度高于普通阅读场景所需。

## 目标

- 恢复并稳定普通输入、中文输入、换行、删除、撤销和重做。
- 保证 React 重渲染、块手柄显示和菜单开关不会破坏 ProseMirror 编辑 DOM。
- 在每次文档变化后保持 Markdown、选区、块 ID 与源行映射处于同一版本。
- 恢复编辑区与预览区的双向滚动、光标定位和预览点击回跳。
- 将块类型、格式、媒体和 AI 操作统一到可搜索的 `/` 命令菜单。
- 保留 Markdown 为唯一持久化格式，并继续对不支持的复杂语法安全回退源码模式。
- 将分栏编辑区改为自适应留白，并弱化预览当前位置提示。

## 非目标

- 不替换 ProseMirror，也不引入 TipTap 等新的编辑框架。
- 不把导出、设置、云同步等非编辑操作加入 `/` 菜单。
- 不改变 Markdown 文件格式，不引入专有块 JSON 持久化。
- 不在本轮增加表格、公式或 Mermaid 的可视化块编辑；这些语法继续使用源码模式。
- 不重做现有 AI 服务商、提示词和网络请求实现，只复用现有入口与差异确认流程。

## 总体架构

方案采用“稳定编辑内核 + 文档桥 + 统一命令注册表”三层结构：

```text
BlockEditorViewport
  ├─ ProseMirrorContentHost（React 声明式宿主，ProseMirror 独占其内部）
  ├─ BlockHandleOverlay（React 管理）
  └─ MenuPortals（Slash / 块属性菜单）
            │ transaction / selection / scroll
            ▼
BlockDocumentBridge
  ├─ Markdown 快照
  ├─ BlockSourceMap
  ├─ EditorController 适配
  └─ Store 发布与外部内容接收
            │ stable EditorController
            ▼
App Scroll Sync  ⇄  Preview source anchors

EditorCommandRegistry
  ├─ 块类型
  ├─ 行内格式
  ├─ 媒体
  └─ AI 操作
        └─ 被 Slash 菜单、块手柄和工具栏共同消费
```

## 组件设计

### 1. BlockEditorViewport

React 在 JSX 中声明固定的 ProseMirror 内容宿主，例如 `.block-editor-content-host`。`EditorView` 使用该节点初始化，生命周期内不再创建或追加同级 DOM。块手柄放在独立 overlay 中，斜杠菜单和块属性菜单渲染到编辑滚动区之外的 Portal 层。

关键约束：

- React 不渲染 ProseMirror 内容宿主内部的任何子节点。
- ProseMirror 视图只在标签页或编辑模式真正变化时创建和销毁。
- 块手柄、菜单、选中状态等 React 更新不得触发编辑视图重建。
- 清理时先注销监听器，再销毁 `EditorView`，最后清空 Store 中的控制器引用。

### 2. BlockDocumentBridge

文档桥负责维护与当前 `EditorView.state.doc` 对应的唯一快照：

```ts
interface BlockDocumentSnapshot {
  markdown: string;
  sourceMap: BlockSourceMap;
  version: number;
}
```

每次 transaction 按以下顺序处理：

1. 应用 transaction 并更新 `EditorView.state`。
2. 当 `docChanged` 时序列化 Markdown，重建 `BlockSourceMap`，递增版本号。
3. 使用同一快照计算当前选区的源偏移和源行。
4. 向 Store 发布 Markdown，并通知预览当前源行。
5. 在下一动画帧刷新滚动同步锚点。

控制器的 `getValue`、`getSelection`、`lineAt`、`getTopForLineNumber`、`replaceRange` 和 Slash 上下文必须从最新快照读取，不再闭包捕获初始化值。

外部 Markdown 更新时：

- 内容仍受块模式支持时，替换文档并尽量映射原选区；外部更新作为明确边界处理，不与用户当前 transaction 交错。
- 内容不受支持时，先向 Store 保留完整原文，再触发源码模式回退。
- 外部内容与当前序列化结果相同则不重建 state，避免光标跳动和撤销栈丢失。

### 3. EditorCommandRegistry

建立与 UI 解耦的命令描述：

```ts
interface EditorCommandContext {
  controller: EditorController;
  mode: 'blocks' | 'source';
  markdown: string;
  selection: EditorSelectionRange;
  currentBlock: BlockCommandTarget | null;
}

interface EditorCommandDefinition {
  id: string;
  category: 'blocks' | 'format' | 'media' | 'ai';
  label: string;
  aliases: string[];
  keywords: string[];
  icon: string;
  isAvailable: (context: EditorCommandContext) => boolean;
  execute: (context: EditorCommandContext) => void | Promise<void>;
}
```

命令类别：

- 块类型：正文、H1–H4、无序列表、有序列表、待办、引用、代码块、分隔线。
- 格式：加粗、斜体、删除线、行内代码、链接；作用于选区或后续输入。
- 媒体：插入图片，复用已有本地图片与图床流程。
- AI：改写、校对、翻译、摘要、扩写/续写；作用于选区，未选择文本时作用于当前块。

斜杠菜单、块手柄和工具栏使用同一注册表，但按入口过滤：块手柄优先显示块转换与块级 AI；工具栏保留高频格式；`/` 菜单显示全部编辑相关命令。

### 4. SlashCommandMenu

输入 `/` 后打开统一可搜索菜单：

- 空查询按“基础块、格式、媒体、AI 写作”分组展示。
- 搜索同时匹配中文标签、英文标签、别名和关键词。
- 上下文不可执行的命令不显示；AI 未配置时保留命令并显示不可用原因和设置入口。
- `ArrowUp`/`ArrowDown` 移动选择，`Enter` 执行，`Escape` 关闭。
- 执行块转换前删除触发文本；执行异步命令期间菜单关闭，但保留文档和选区。
- 菜单位置基于最新选区坐标，并限制在可视窗口内。

### 5. AI 命令

AI 命令沿用现有请求和差异确认机制：

1. 构造当前选区或当前块的 Markdown 上下文。
2. 调用现有 AI action；正文保持不变。
3. 成功后打开差异确认框，展示原文与建议文本。
4. 用户确认后通过文档桥执行一次替换或插入 transaction。
5. 整个应用动作进入一次撤销记录；取消或请求失败不修改正文。

“续写”默认在当前块下方插入新块；改写、校对、翻译默认替换选区或当前块；摘要默认插入当前块下方。最终写入仍需用户确认。

## 键盘与基础编辑行为

- 普通输入和中文输入法组合事件由 ProseMirror 原生处理。
- `Enter`：普通块创建同级块；列表中创建下一列表项；空列表项退出列表。
- `Shift+Enter`：在当前块中插入软换行。
- `Backspace`：空的非正文块先转换为正文，再次按下与上一块合并。
- `Mod+Z` / `Mod+Shift+Z`：撤销和重做。
- 当 Slash 菜单打开时，仅菜单导航键被拦截；其他输入继续交给 ProseMirror。
- 菜单关闭或命令完成后恢复编辑器焦点和合理选区。

## 编辑区与预览视觉

### 自适应编辑留白

采用已确认的 B 方案：

- 横向边距使用约 `clamp(20px, 4vw, 48px)`，根据编辑面板宽度平滑变化。
- 正文最大宽度从 860px 适度提高到约 980px。
- 分栏和小窗口优先保证可编辑宽度；沉浸写作仍保持居中阅读节奏。
- 块手柄位于正文边距内，不再额外挤压正文宽度。

### 预览当前位置

采用已确认的 A 方案：

- 使用 2px 左侧强调线。
- 背景只保留约 4%–6% 的强调色混合。
- 移除当前 4px 阴影式侧边条。
- 光标移动只更新提示；仅当目标离开预览视口时才滚动到可见区域。
- 列表项、引用和表格继续使用现有源行选择规则，但统一使用轻量视觉。

## 滚动同步

- 编辑滚动和预览滚动继续双向同步。
- 锚点由最新 `BlockSourceMap` 与预览 `[data-source-line]` 共同生成。
- 文档变化、预览渲染完成、窗口尺寸变化和分栏拖动后重建锚点。
- 滚动计算使用动画帧节流；程序化设置目标滚动位置时登记目标值，消费对应事件后立即释放，防止反馈循环。
- 光标行变化只负责当前位置提示；显式预览点击、大纲跳转或目标离开视口时才执行对齐滚动。
- 当缺少精确块锚点时按全局滚动比例降级，不能停止同步。

## 异常处理

- ProseMirror 初始化失败时显示可恢复提示，并允许切换源码模式；原 Markdown 不变。
- 解析到不支持的 Markdown 时完整回退源码模式，不进行部分转换。
- 命令执行前检查上下文；不可执行的命令不修改文档。
- AI 未配置时显示原因与设置入口；请求失败或取消时保持正文和选区不变。
- 图片上传失败时不插入无效节点，并保留原块。
- 外部 Store 更新与用户 transaction 冲突时，以最新版本号和内容等价检查阻止旧更新覆盖新输入。

## 测试设计

实施遵循测试先行，每一类行为先增加能稳定失败的测试。

### 单元测试

- 文档桥在 transaction 后同步更新 Markdown、版本号、选区源偏移和 `BlockSourceMap`。
- 行号与块 DOM 锚点映射在插入、删除、换行和块转换后保持正确。
- 命令注册表按分类、关键词、别名和上下文返回正确命令。
- AI 命令从选区或当前块构造正确上下文，取消和错误路径不产生 transaction。
- 滚动锚点插值、边界降级和程序化滚动锁保持现有行为。

### 编辑行为测试

- 普通输入、中文组合输入、Enter、Shift+Enter、Backspace、撤销和重做。
- React 状态更新、块手柄出现、Slash 菜单开关后内容宿主仍存在且保持可编辑。
- `/` 菜单分组、搜索、键盘导航、命令执行和焦点恢复。
- 格式、块转换、图片入口和 AI 差异确认写回。
- 不支持语法进入源码模式且 Markdown 字节内容不丢失。

### 集成与视觉验收

- 编辑滚动驱动预览、预览滚动驱动编辑、预览点击回跳编辑位置。
- 光标移动更新轻量定位样式，目标在视口内时不强制滚动。
- 分栏宽度变化后留白符合 20–48px 自适应范围，正文最大宽度约 980px。
- 深色和浅色主题下菜单、定位提示、焦点环和禁用状态可辨识。
- 完整执行 `npm test`、`npm run lint`、`npm run build`，并在桌面端完成交互冒烟测试。

## 验收标准

- 块编辑器连续输入、换行、删除和撤销均可用，不因任何 React 菜单状态更新失焦或消失。
- 每次编辑后 Store Markdown 与重新序列化文档一致，保存和重新打开不丢内容。
- 编辑/预览双向同步、当前行提示和预览点击定位均可用。
- `/` 菜单包含块、格式、媒体和 AI 四类编辑命令，支持键盘和中英文搜索。
- AI 结果必须经过差异确认才写入，并可通过一次撤销恢复。
- 分栏编辑区留白明显小于当前版本，预览当前位置提示不再呈现突兀色块。
- 复杂 Markdown 回退源码模式时内容完整保留。
- 自动化测试、Lint、生产构建和桌面冒烟测试全部通过。
