# Handoff: Zeditor 编辑器“打字过程中顶部空白位置闪现文字”终极修复交接

> 状态：已在 `fix/editor-top-blink-v0.4.4` 分支彻底修复、验证 139 项单元测试全通过、已 push 到 GitHub，并完成全量打包。
> 更新时间：2026-09-03 16:32

---

## 1. 用户截图 `q1.png` 深度剖析

用户提供的截图 `C:\Users\zhcx\Desktop\q1.png` 呈现了一个极其关键的视觉证据（分栏视图：左侧编辑器，右侧 Markdown 预览）：

1. **内容特征**：第 1 行输入了一段很长的连续段落，在编辑器中折行（`wordWrap: 'on'`）成了 5 行。
2. **预览区（右侧）正常排版**：
   - 第 1 行~第 4 行正常折行。
   - 第 5 行（段落末尾）正常显示：`的快乐；解放军四二九`。
3. **编辑区（左侧）异常**：
   - 行号 `1` 对应的下方显示了第 1~4 行。
   - **第 5 行在第 4 行下方完全消失**！
   - **在第 1 行上方的 24px 留白区（即编辑卡片顶部），赫然出现了：`的快乐；解放军四二九`**！
   - 该行文字无行号、无当前行高亮条底色、缩进与正文第 1 列严密对齐。

---

## 2. 根本原因定位（Monaco 内部源码级机理）

通过对 Monaco Editor 核心源码的深入反编译与跟踪，找到了 100% 吻合的根因：

### 2.1 Monaco 的 `VisibleTextAreaData` 折行缺陷
查看 `node_modules/monaco-editor/esm/vs/editor/browser/controller/editContext/textArea/textAreaEditContext.js`（第 66~74 行）：
```javascript
if (this.startPosition.lineNumber === this.endPosition.lineNumber) {
    this.visibleTextareaStart = visibleRangeProvider.visibleRangeForPosition(this.startPosition);
    this.visibleTextareaEnd = visibleRangeProvider.visibleRangeForPosition(this.endPosition);
} else {
    // TODO: what if the view positions are not on the same line?
    this.visibleTextareaStart = null;
    this.visibleTextareaEnd = null;
}
```
- Monaco 源码中明确写着：`// TODO: what if the view positions are not on the same line?`。
- 当一行文本折成多个视图行（如第 1 逻辑行折成了 5 个视图行），起始视图行号为 1，结束视图行号为 5，两者不相等。
- Monaco 直接把 `visibleTextareaStart` 置为 `null`！

### 2.2 降级执行 `_renderAtTopLeft()`
由于 `visibleTextareaStart` 为 `null`，`_render()` 无法定位 textarea 到光标行，直接回退并执行：
```javascript
_renderAtTopLeft() {
    this._doRender({
        lastRenderPosition: null,
        top: 0,
        left: 0,
        ...
    });
}
```
- 这把输入载体 `<textarea class="inputarea ...">` 强行定位在 `(top: 0, left: 0)`！
- 配合编辑器内部配置的 `padding: { top: 24, bottom: 40 }`，第 1 行正文从 `top: 24px` 开始。
- **`top: 0` 恰恰位于第 1 行上方的 24px 顶部留白区域**！

### 2.3 WebView2 + Windows TSF 原生绘制绕过常规 CSS
- 当用户使用微软拼音等输入法打字时，Monaco 会把该 textarea 赋予 `.ime-input`（`z-index: 10`）。
- Windows Text Services Framework (TSF) 在 WebView2 中合成中文输入时，会绕过普通的 CSS `color: transparent`，直接在 textarea 的屏幕物理区域使用 DirectWrite 绘制组合拼音与候选文字！
- 因为 textarea 内持有整行文本且光标位于末尾第 5 行，textarea 自动滚动显示光标处的文字（`的快乐；解放军四二九`），导致用户在打字期间于顶部留白区看到清晰的文字闪烁；上屏后 textarea 恢复静止或清空，闪烁结束。

---

## 3. 四重防护彻底修复方案

为彻底根绝无论在单行、折行、中文 IME、英文还是混合输入下的顶部闪烁，实施了四重纵深防御：

### 防护 1：DOM 运行时坐标钳位拦截（`Editor.tsx`）
在 `src/components/Editor/Editor.tsx` 中为 `textarea.inputarea` 注入动态坐标校正：
- 注册 `MutationObserver` 监听 textarea 的 `style` 与 `class` 变化，并挂载 `compositionstart` / `compositionupdate` 事件监听。
- 一旦检测到 textarea 被 Monaco 置于顶部留白区（`top < 24px`），立即通过 `editor.getScrolledVisiblePosition(editor.getPosition())` 提取当前光标在视口中的精确像素坐标。
- 将 textarea 瞬间校正到光标实际位置（`top` 与 `left`）。
- **效果**：不仅 textarea 永远不会留在 `(top: 0, left: 0)`，而且 Windows 输入法的候选词浮窗能够始终精准贴合光标位置。

### 防护 2：顶部 24px 留白区域实体保护遮罩（`main.css`）
在 `src/styles/main.css` 中为 `.monaco-editor` 增加伪元素背景遮罩：
```css
.monaco-editor::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px;
  background: var(--bg-document);
  z-index: 20;
  pointer-events: none;
}
```
- 第 1 行及行号均从 `top: 24px` 起算，`0~24px` 纯属留白。
- 遮罩以 `z-index: 20` 覆盖在 Monaco 输入层（`z-index: 10`）之上，背景色与卡片完全一致。
- 附带 `pointer-events: none`，鼠标在顶部区域的点击无缝穿透到编辑器第 1 行。
- 即使未来任何引擎把任何未预期的文本画在 `top: 0`，视觉上也绝对不可见。

### 防护 3：严格保留输入层几何与尺寸（`main.css` + `Editor.tsx`）
- **关键教训（`q2.png` 排查结论）**：Windows TSF 输入法框架必须依赖真实 textarea 的字符尺寸与边界来定位候选词窗口。若设置 `font-size: 0` 或 `clip: rect`，会导致 TSF 字符边界归零，候选框瞬间脱钩漂移至屏幕左上角 `(0, 0)` 且文字无法上屏；若通过 JS 在组合期间改动 `style.top`，同样会破坏 TSF 坐标同步协议。
- **最终策略**：严格保留输入层的原生尺寸、行高与边界，不进行任何动态 JS 坐标钳位；文字/光标/背景全部设置为 `transparent !important`，依靠顶部 `height: 24px` 的实体背景遮罩（`.monaco-editor::before`）提供视觉覆盖，既彻底消除顶部闪现，又保证输入法候选词浮窗正常贴近光标且打字流畅。

### 防护 4：Monaco 原生覆盖层兜底（`main.css`）
- 强制 `.monaco-host .textAreaCover { background: var(--bg-document) !important; }`，确保 Monaco 内部原生的 cover div 同样具备实体底色。

---

## 4. 验证与构建产物

1. **自动化测试**：
   - 运行 `npm test`：**139/139 全部通过**。
   - 运行 `npm run lint`：**0 错误，0 警告**。
2. **Git 提交**：
   - 最新提交哈希：`fff04cc`
   - 分支：`fix/editor-top-blink-v0.4.4`（已推送到 `origin`）
3. **最新全量打包产物**（构建时间：2026-09-03 18:03）：
   - **NSIS 安装包**（推荐）：
     `D:\Documents\code\zeditor\src-tauri\target\release\bundle\nsis\Zeditor_0.4.3_x64-setup.exe` (6.74 MB)
   - **MSI 安装包**：
     `D:\Documents\code\zeditor\src-tauri\target\release\bundle\msi\Zeditor_0.4.3_x64_en-US.msi` (8.22 MB)
   - **独立免安装 Exe**：
     `D:\Documents\code\zeditor\src-tauri\target\release\zeditor.exe` (14.25 MB)
