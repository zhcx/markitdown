<div align="center">

# ✨ MarkitDown

**一款现代化的 Markdown 编辑器**

*让写作回归纯粹，让创作充满灵感*

[![Release](https://img.shields.io/github/v/release/zhcx/markitdown?style=flat-square)](https://github.com/zhcx/markitdown/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](https://github.com/zhcx/markitdown/blob/main/LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/zhcx/markitdown/releases)

<img src="src-tauri/icons/icon.png" alt="MarkitDown Logo" width="128" height="128">

</div>

---

## 🌟 关于这个项目

> **这是我第一个使用 Claude Code 和 CodeX 通过「Vibe Coding」方式创建的项目。**
>
> 没有繁琐的需求文档，没有刻板的开发计划。我只是告诉 Claude：「我想做一个像 Typora 那样的 Markdown 编辑器」，然后我们开始了一场编码对话——我描述想法，Claude 实现代码，我调整方向，Claude 优化细节。
>
> 这不是传统的软件开发流程，更像是一场人与 AI 的即兴合奏。每一次「试试这样」的念头，都在几秒钟内变成了真实的代码。这种感觉，就像用吉他即兴演奏——你不需要提前写好谱子，旋律在指尖自然流淌。
>
> 这个项目诞生于一个下午的灵感碰撞，见证了 AI 辅助创作的无限可能。

---

## ✨ 核心功能

### 📝 编辑体验
- **实时预览** - 左侧编辑，右侧即时渲染
- **沉浸阅读 / 沉浸写作** - 阅读与写作分别提供专注空间，可保留大纲和 AI Chatbox
- **多标签页** - 同时编辑多个文件
- **Monaco 编辑器** - 语法高亮、自动换行、当前行定位和专业编辑体验
- **可调节布局** - 自由拖动调整侧边栏和编辑区域宽度
- **同步滚动与大纲** - 编辑器和预览联动，按 Markdown 标题自动生成大纲

### 🎨 渲染能力
- **数学公式** - KaTeX 渲染，支持行内与块级公式
- **Mermaid 图表** - 流程图、时序图、甘特图等
- **代码高亮** - highlight.js 支持
- **任务列表** - 待办事项管理
- **GitHub 风格 Markdown** - 更贴近 GitHub 的排版与换行行为
- **图片与视频** - 粘贴图片自动保存或上传图床，支持 B 站、YouTube 与 Vimeo 视频
- **写作辅助** - Markdown 检查与格式化、完整语法指南、原生 Emoji 和常用表情

### 🎯 界面设计
- **多主题支持** - Claude Light/Dark Theme 与 Notion Light/Dark Theme，可从“功能 → 主题”菜单切换
- **编辑增强** - 编辑器行号、可拖动网格选择并插入 Markdown 表格
- **图片导出** - 支持 1:1、4:3、16:9、9:16、A4 比例预览并导出 PNG
- **现代化设计** - Notion 风格的简洁界面
- **右键菜单** - 快捷操作，从列表移除文件

### 📁 文件管理
- **拖拽打开** - 直接拖入文件到窗口打开
- **最近文档** - 快速访问历史文件
- **文件夹浏览** - 打开文件夹，树形展示

### 🖼️ 图片上传
- **多图床支持** - Cloudinary、PicGo、S3、本地存储

### 🤖 AI 智能助手
- **AI 对话面板** — 侧边栏自由对话，支持流式输出与思维链展示
- **智能校对** - 自动检测错别字、语法错误、标点问题
- **伴写建议** - 根据上下文提供写作建议
- **文本重写** - 一键改写选中内容
- **智能翻译** - 支持多语言翻译
- **摘要生成** - 自动生成文档摘要
- **大纲生成** - 智能提取文档大纲
- **思维链展示** — DeepSeek/硅基流动模型思考过程实时流式显示
- **思考模式** — 关闭/快速/均衡/深度，灵活控制 AI 推理强度
- **关联文档** — 一键将当前编辑文档作为对话上下文
- **附件上传** — 图片和文本文件上传，与对话一起发送
- **本地 Agent（Beta）** — 在同一面板调用 Claude Code、Codex 或 OpenCode，支持流式任务、命令审批和会话恢复
- **隔离变更审阅** — Git 仓库任务在临时 worktree 中工作，完成后可按文件应用，不覆盖当前未提交修改

### 🤖 AI 服务商支持

| 服务商 | 状态 |
| --- | --- |
| OpenAI | 支持 |
| DeepSeek | 支持（含思维链） |
| 硅基流动 (SiliconFlow) | 支持（含思维链） |
| Anthropic | 支持 |
| 小米 MiMo | 支持 |
| 火山引擎 / 豆包 | 支持 |
| LongCat | 支持 |
| 智谱 AI | 支持 |
| MiniMax | 支持 |
| Kimi | 支持 |
| 自定义 OpenAI 兼容 | 支持 |

### 🧩 本地 Agent 支持（桌面端 Beta）

| Agent | 接入方式 |
| --- | --- |
| Claude Code | Stream JSON + PreToolUse 审批 Hook |
| Codex | App Server JSON-RPC v2 |
| OpenCode | 本地 Server API + SSE |

Agent 默认关闭，需要先在“设置 → AI 助手”中启用。MarkitDown 复用各 CLI 的登录与默认模型，不保存其账号凭据。Git 根目录中的任务使用隔离 worktree；其他目录在进入 Agent 后授权为当前会话的读写范围，修改会直接写入。命令、网络和 MCP 默认逐次审批，也可仅对当前会话启用完全允许。详细说明见 [Agent 使用与安全说明](docs/agent-support.md)。

### 🔄 自动更新

- MarkitDown 菜单 → 检查更新
- 自动检测 GitHub Release 最新版本
- 一键下载安装包，实时进度显示

### 💾 导出功能
- **HTML 导出** - 自定义模板
- **PDF 导出** - 专业排版输出

---

## 🚀 快速开始

## v0.3.4 更新

### 更新日志

- 新增本地 Agent（Beta），可调用 Claude Code、Codex 和 OpenCode，并支持流式任务、命令审批与会话恢复。
- AI 对话和 Agent 均可新建、保存并从历史记录恢复会话，切换工作目录时正确关联对应记录。
- 编辑器右键菜单新增 AI 润色、AI 翻译、复制为 HTML、导出、插图和文件定位等常用操作。
- 统一编辑器、预览区与资源管理器滚动条，并移除 Monaco 右侧多余概览标记。
- 编辑器与预览区新增当前内容联动高亮，支持双向点击定位并将对应内容保持在同一水平位置。
- 修复安装版编辑器异常收窄、点击后误选文字及长列表高亮范围过大的问题，并支持预览目录锚点跳转。
- 关闭干扰中文写作的易混淆 Unicode 横幅和粘性标题黑条，取消动画滚动以提升双栏滚动响应。
- 设置中的内容字号可实时同步到编辑器和预览区，保存设置改为异步持久化，减少界面停顿。
- 优化 Agent 设置排版、错误提示、直接写入状态和浮动编辑栏尺寸，并移除 Inkwell 主题。

### v0.3.4 平台安装包对照

> 以下链接指向 v0.3.4 Release 资产；安装包由 GitHub Actions 根据本版本源码构建。

| 操作系统 | 架构 | 推荐安装包 | 适用场景 |
| --- | --- | --- | --- |
| Windows 10/11 | x86_64 | [NSIS `.exe`](https://github.com/zhcx/markitdown/releases/download/v0.3.4/MarkitDown_0.3.4_x64-setup.exe) | 推荐大多数用户使用，按向导安装 |
| Windows 10/11 | x86_64 | [MSI](https://github.com/zhcx/markitdown/releases/download/v0.3.4/MarkitDown_0.3.4_x64_en-US.msi) | 企业部署、系统管理或静默安装 |
| macOS Apple Silicon | arm64 | [DMG](https://github.com/zhcx/markitdown/releases/download/v0.3.4/MarkitDown_0.3.4_aarch64.dmg) | M1、M2、M3、M4 等 Apple 芯片 |
| macOS Apple Silicon | arm64 | [APP 压缩包](https://github.com/zhcx/markitdown/releases/download/v0.3.4/MarkitDown_aarch64.app.tar.gz) | 手动解压或更新 |
| macOS Intel | x86_64 | [DMG](https://github.com/zhcx/markitdown/releases/download/v0.3.4/MarkitDown_0.3.4_x64.dmg) | Intel 芯片 Mac |
| macOS Intel | x86_64 | [APP 压缩包](https://github.com/zhcx/markitdown/releases/download/v0.3.4/MarkitDown_x64.app.tar.gz) | 手动解压或更新 |
| Ubuntu / Debian | x86_64 | [DEB](https://github.com/zhcx/markitdown/releases/download/v0.3.4/MarkitDown_0.3.4_amd64.deb) | Ubuntu、Debian、Linux Mint 等 |
| Fedora / RHEL / openSUSE | x86_64 | [RPM](https://github.com/zhcx/markitdown/releases/download/v0.3.4/MarkitDown-0.3.4-1.x86_64.rpm) | RPM 系发行版 |
| 通用 Linux | x86_64 | [AppImage](https://github.com/zhcx/markitdown/releases/download/v0.3.4/MarkitDown_0.3.4_amd64.AppImage) | 无需安装，赋予执行权限后运行 |

> 不确定如何选择？Windows 下载 `.exe`，Apple 芯片 Mac 下载 `aarch64.dmg`，Intel Mac 下载 `x64.dmg`，Ubuntu/Debian 下载 `.deb`。

完整更新说明与安装提示见 [`docs/releases/v0.3.4.md`](docs/releases/v0.3.4.md)。

## Contributors

- CodeX

### 下载安装

从 [Releases](https://github.com/zhcx/markitdown/releases) 页面下载适合您系统的安装包：

| 平台 | 架构 | 推荐下载 | 安装包格式 |
|------|------|----------|-----------|
| Windows | x86_64 | `.exe` (NSIS) | `.msi` / `.exe` |
| macOS Intel | x86_64 | `.dmg` | `.dmg` / `.app.tar.gz` |
| macOS Apple Silicon | arm64 | `.dmg` | `.dmg` / `.app.tar.gz` |
| Linux | x86_64 | `.AppImage` | `.deb` / `.rpm` / `.AppImage` |

### 本地构建

```bash
# 克隆仓库
git clone https://github.com/zhcx/markitdown.git
cd markitdown

# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建发布
npm run tauri build
```

**环境要求：**
- Node.js >= 18
- Rust >= 1.70
- Python >= 3.10（仅从源码运行或开发文档转换功能时需要）

### 文档转换

应用的“文件 → 导入并转换文档…”菜单和文件拖入支持将文档转换为未保存的 Markdown 标签页。为减小主程序下载体积，Microsoft MarkItDown 及 PDF、Word、Excel、PowerPoint 依赖改为按需安装的本地转换模块；首次使用时可从 GitHub 一键安装，也可导入提前下载的离线模块包，无需安装 Python。

从源码运行时，为开发环境安装依赖：

```bash
python -m pip install -r requirements.txt
```

转换文件始终在本机处理，不会上传到服务器。Windows 转换模块当前不进行 Authenticode/SignPath 代码签名，但应用会强制验证签名发布清单和模块 SHA-256。

如需让应用显式使用自行维护的 Python 环境，可在启动前设置 `MARKITDOWN_PYTHON` 为对应 Python 可执行文件的绝对路径；应用不会自动探测或安装 Python 依赖。

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 编辑器引擎 | Monaco Editor |
| Markdown 渲染 | markdown-it + KaTeX + Mermaid |
| 状态管理 | Zustand |
| 后端框架 | Tauri 2.0 (Rust) |
| HTTP 客户端 | Reqwest |
| 样式方案 | 纯 CSS + CSS Variables |

---

## 📂 项目结构

```
markitdown/
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   │   ├── Chatbot/        # AI 对话面板
│   │   ├── Editor/         # Monaco 编辑器
│   │   ├── Preview/        # Markdown 渲染预览
│   │   ├── Toolbar/        # 工具栏按钮
│   │   ├── Sidebar/        # 文件管理侧边栏
│   │   ├── MenuBar/        # 顶部菜单栏
│   │   ├── Export/         # 导出功能
│   │   └── Settings/       # 设置面板
│   ├── stores/             # Zustand 状态管理
│   └── styles/             # CSS 样式
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── main.rs         # Tauri 入口
│   │   ├── commands.rs     # IPC 命令
│   │   ├── ai/             # AI API 客户端
│   │   ├── image/          # 图床模块
│   │   └── pdf/            # PDF 导出
│   └── Cargo.toml
└── .github/workflows/      # CI/CD 配置
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 🔏 Code signing policy

Windows 代码签名的构建来源、审批角色、验证方法与当前接入状态见 [Code Signing Policy](CODE_SIGNING_POLICY.md)。隐私与可选第三方数据传输说明见 [Privacy Policy](PRIVACY.md)。

SignPath Foundation 申请目前处于准备/审核阶段；在正式启用前，发布页必须明确标识未签名的 Windows 安装包。启用后的署名为：**Free code signing provided by SignPath.io, certificate by SignPath Foundation**。

---

## 📄 许可证

[MIT License](https://github.com/zhcx/markitdown/blob/main/LICENSE)

---

## 📈 项目更新热力图

<div align="center">

[![GitHub 更新热力图](https://ghchart.rshah.org/2196f3/zhcx)](https://github.com/zhcx/markitdown/graphs/commit-activity)

</div>

---

<div align="center">

**用 ❤️ 和 Claude Code、CodeX 构建**

*If you like this project, give it a ⭐!*

</div>
