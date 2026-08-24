# Zeditor Notion 式兼容混合块编辑器设计

> 日期：2026-08-24
> 目标分支：`feature/webdav-backup`
> 设计状态：已确认方向，等待按实施计划开发

## 1. 目标与边界

Zeditor 从“Markdown 源码编辑器 + 独立预览”升级为“Markdown 兼容的块编辑器”，让用户可以像 Notion 一样以段落、标题、列表和待办等块为单位输入、插入、移动和删除内容，同时继续打开、保存、导出和云备份现有 `.md` 文件。

第一阶段只覆盖基础写作块：段落、一级至四级标题、无序列表、有序列表、待办列表、引用、代码块、分隔线、图片，以及链接和粗体/斜体等基本行内格式。表格、Callout、Toggle、数学公式、Mermaid、数据库块、多列布局、多人协同不纳入第一阶段的块模式。

## 2. 已确认的关键决策

### 2.1 采用兼容混合型

普通 Markdown 内容通过块模型编辑；高级或暂不支持的 Markdown 内容继续使用 Monaco 源码模式。用户可在编辑器顶部切换“块编辑 / 源码”，不为块编辑另造一套永久文档格式。

### 2.2 Markdown 是唯一持久化格式

`.md`、`.markdown` 和 `.txt` 仍然是保存、预览、导出、时间线、WebDAV 备份和 S3 备份的唯一内容来源。块树只存在于当前编辑会话中，块编辑器每次文档事务都序列化为 Markdown 后调用既有 `setContent`/标签页更新链路。

不引入 `.zdoc`，不维护 Markdown 与块树的双轨副本，因此不需要新增迁移协议、冲突合并规则或云端对象格式。

### 2.3 采用渐进式降级而不是有损解析

打开文档时先做能力检测：

- 只含第一阶段支持语法的文档进入块模式。
- 含表格、数学公式、Mermaid、HTML、`details`、脚注、视频语法或其他未支持结构的文档进入源码模式，并显示“该文档包含暂不支持的 Markdown 结构”的提示。
- 源码模式中的内容不会被块解析器重写。用户只有在文档通过能力检测后才能切回块模式。
- 块模式产生暂不支持的语法时，立即保留当前 Markdown 内容并切换到源码模式，不丢失用户输入。

支持的 Markdown 文档在块模式中首次产生编辑后允许规范化排版，例如列表标记和代码围栏会由统一序列化器输出；语义和用户可见内容必须保持不变。

## 3. 用户交互设计

### 3.1 块级交互

- 每个顶层块悬停时显示左侧块手柄，手柄提供“复制、删除”和拖拽入口。
- 拖拽第一阶段只允许移动顶层块；列表内部继续由列表键盘行为管理，避免把嵌套列表误拆成独立文档块。
- 空块输入 `/` 打开已有 Slash 菜单；选择标题、列表、待办、引用、代码、图片或分隔线后直接创建对应块。
- 输入 `# `、`## `、`- `[] `、`- ` `、`1. `、`> ` 和三个反引号时，按 Markdown 输入规则转换为对应块。
- 空块按 Enter 创建下一个段落；空列表项按 Backspace 退出列表；普通块按 Backspace 与前块合并。
- 现有选中文本工具栏、右键菜单、撤销/重做和 AI 替换继续可用。

### 3.2 源码模式与切换

- 编辑器顶部显示当前模式，并提供“切换到源码 / 切换到块编辑”按钮。
- 切回块模式前执行能力检测；检测失败时停留在源码模式并列出触发降级的语法类型。
- 新建空文档默认进入块模式。
- 每个标签页保存 `editorMode`，旧的已持久化标签页缺少该字段时按 `blocks` 处理，再由能力检测决定最终显示模式。

## 4. 技术架构

### 4.1 编辑器引擎

保留 Monaco 作为源码模式编辑器，新增基于 ProseMirror 的块编辑器。ProseMirror 负责块树、选择、历史、输入规则、拖拽和键盘命令；`prosemirror-markdown` 与项目现有 `markdown-it` 配置负责 Markdown 解析/序列化。

`src/components/Editor/Editor.tsx` 变为编辑器宿主，按标签页模式挂载 `SourceEditor` 或 `BlockEditor`。现有 Monaco 实现抽取到 `SourceEditor.tsx`，保持 Monaco 的查找、右键菜单和源码模式行为不变。

### 4.2 Controller 兼容层

`EditorController` 继续作为 Zustand、AI、工具栏、大纲和 App 滚动同步的公共接口。块编辑器实现同一接口：

- `getValue()` 返回当前序列化后的 Markdown。
- `getSelection()`、`getText()`、`replaceRange()` 使用 Markdown 字符偏移，而不是 ProseMirror 内部位置。
- `state.doc.line*` 从当前 Markdown 快照计算，保证现有 AI、状态栏、大纲和搜索定位调用无需知道块树。
- `getTopForLineNumber()` 与 `revealOffset()` 通过块源映射定位到对应块 DOM；找不到精确位置时使用最近块。
- `state.update()` 继续接受现有的 `changes`、`selection` 和 `scrollIntoView` 结构。源码插入导致不支持语法时触发安全降级。

块编辑器维护 `BlockSourceMap`，记录块 ID、ProseMirror 文档范围、序列化 Markdown 起止偏移和源代码行号，作为块选择与现有字符偏移 API 之间的桥梁。

### 4.3 数据流

```text
文件/标签页 Markdown
        │
        ├─ 能力检测失败 ──> SourceEditor(Monaco)
        │
        └─ 能力检测通过 ──> MarkdownParser ──> ProseMirror BlockEditor
                                         │
                              用户事务 ──┘
                                         │
                         MarkdownSerializer + BlockSourceMap
                                         │
                 setContent/updateTabContent/时间线/本地保存
                                         │
                               WebDAV + S3 异步备份
```

本次不修改 Rust 文件和云端对象协议，因为云备份已经接收本地保存后的 Markdown 内容。

## 5. 验收标准

- 新建空文档可以直接以块模式输入；标题、列表、待办、引用、代码块和分隔线的 Slash 插入、快捷输入和键盘编辑可用。
- 现有支持范围内的 Markdown 打开后不丢失内容；块编辑后再次保存、关闭重开，语义和渲染结果一致。
- 含表格、数学公式、Mermaid 或 HTML 的文档自动进入源码模式，不被块模式重写。
- 块编辑后的 `content` 仍通过既有标签页 dirty 状态、本地保存、时间线、WebDAV 和 S3 队列；云端故障不阻塞本地保存。
- AI、工具栏、状态栏选区统计、大纲跳转、预览点击回源和分栏滚动同步在块模式下仍工作；不支持的命令明确切换到源码模式或显示不可用状态。
- `npm test`、`npm run lint`、`npm run build`、Rust 既有测试和打包前检查全部通过。

## 6. 非目标与后续阶段

第一阶段不处理数据库块、多列布局、多人协作、实时冲突合并、`.zdoc`、表格可视化编辑、Callout/Toggle 专属节点以及大文档虚拟化。后续加入这些能力时，应先扩展 Markdown 能力检测、节点 schema、序列化器和源映射测试，再接入 UI，不能绕过唯一 Markdown 持久化边界。
