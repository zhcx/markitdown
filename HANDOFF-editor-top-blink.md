# Zeditor 输入文字消失 / 首行上方闪字：CSP 排查与验证

更新：2026-09-05。此前关于 TSF 捕获透明颜色、Monaco 必然隐藏正文、跨行必然调用
`_renderAtTopLeft()` 的推断未被实测支持，旧交接结论撤销。不能用 CSS 正则测试或
Vite 开发页面正常，宣称 Windows 安装包的问题已解决。

## 已复现的根因

在实际 release 程序的 WebView2 152 中，通过本地调试端口执行原生
`Input.imeSetComposition` 并检查 DOM：

- `.view-line` 的 HTML 有 `style="top:24px;height:22px;line-height:22px"`。
- 该节点 `style.cssText` 却为空，实际 `getBoundingClientRect().height` 为 0，top 落在容器顶部。
- `securitypolicyviolation` 报 `style-src-attr` 和 `style-src-elem`，blockedURI 为 `inline`。
- 真实策略为 `style-src 'self' 'unsafe-inline' 'nonce-…'`。
- Tauri 给启动页内联样式注入 nonce 后，浏览器忽略同一指令中的 `'unsafe-inline'`。
  Monaco 用 HTML 创建的行坐标，以及运行时样式表被拒绝；通过 `element.style.top`
  等单属性方式更新的旧节点仍可定位，因此表现为间歇闪字、输入结束后恢复。
- 在故障窗口仅重新应用被拒绝的两行 top/height，整段正文立即恢复。原 model 未丢数据。

旧版顶部 24px 遮罩只是盖住了定位失败的正文，使“顶部闪字”变成“正文消失”。

## 修复范围

1. `tauri.conf.json` 仅对 `style-src` 关闭 Tauri 的 CSP 自动注入，保留原先明确允许的
   动态 CSS。脚本哈希注入及 `script-src`、对象/表单限制均保留。
2. 删除顶部遮罩及输入载体 opacity/color/selection 干预。通用表单外观规则排除
   Monaco 的 `.inputarea` / `.ime-text-area`，由 Monaco 管理组合态显隐和几何。
3. 保留原生 EditContext 默认值和 textarea 兼容选择。Rust `EditorSettings` 补上
   `input_engine` 的序列化/默认值；React 监听该设置并对现有实例调用 `updateOptions`。
   旧实现没有 Rust 字段、也没有实时更新，所以设置界面与实际引擎可能不一致。
4. 删除验证遮罩和透明补丁存在的旧测试，改用真实 WebView2 的行几何与 CSP 检查。

## 回归命令

先正常构建 `npm run tauri build`。在专用测试实例启动前设置进程环境变量
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9235`。
仅用于本地测试；不要在正式配置中启用调试端口。须退出同标识的其他实例，防止单实例转发。

```text
node scripts/verify-editor-ime.mjs verify-csp
node scripts/verify-editor-ime.mjs verify-input test-output/ime-native.png
```

`verify-csp` 检查 HTML 样式坐标/行高、动态样式表，以及非授权内联脚本仍被拒绝。
旧 release 在行定位检查失败（`auto !== 24px`），且同时产生两类样式 CSP violation。

`verify-input` 创建一个新的未命名测试标签页，检查短行/折行正文、连续组合更新、
上屏、取消、首列输入和撤销，检查每行的非零高度、无重叠坐标及无样式 CSP 错误。
测试文档会留在窗口中，便于截图和复核。保存另一输入引擎后再次运行；新实现应立即切换。
可用第三个位置参数指定端口，例如 `verify-input test-output/ime-textarea.png 9235`。

这是真实 WebView2 的浏览器组合路径测试，不是 OS 输入法候选窗口的自动测试。
交付前仍应实测系统中文输入法，并区分哪些现象已复现验证。

```text
npm test
npm run lint
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

设置测试涵盖两种引擎的 JSON 保存/加载往返，以及旧设置缺字段时的默认值。

## 本次验证结果（2026-09-05 / 09-06）

- 前端测试 137 项、Rust 测试 140 项、Lint 及正式 Tauri 打包通过。
- 新 release 的 CSP 探针：HTML 行 top=24px / height=22px，动态样式色值正确；
  两类样式 violation 均为零，内联脚本仍被拒绝。
- EditContext 和 textarea 分别通过 17 个输入阶段检查；覆盖 4 行折行组合、
  取消、提交、首列组合、撤销、退格、中英混输，以及 Enter 后出现第 2 逻辑行。
- 使用 Windows 系统按键输入 b → bu，真实 textarea 进入 ime-input 状态；
  8 个可见视图行全部保持正常坐标和 22px 高度，截图未出现正文消失或顶部闪字。
- 设置界面保存两种引擎后，实际 DOM 引擎立即切换；Rust get_settings 重新读取值一致。
  测试后已恢复原生 EditContext。此次未强制退出包含正在编辑文档的测试窗口。
- 安装包保存于 test-output/ime-csp-fix-20260905，生成于 2026-09-05 19:02。
  NSIS SHA-256：9ED55FB4FE5373D6B389842FC7C76BAE177537485F3C3C775E6AEC0FD395B020。
  版本仍为 0.4.3，未签名；此目录用于与此前同版本的失败构建区分。

参考：
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
- Tauri 本地 `node_modules/@tauri-apps/cli/config.schema.json` 的 `dangerousDisableAssetCspModification`
