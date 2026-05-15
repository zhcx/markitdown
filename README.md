<div align="center">

# ✨ MarkitDown

**一款现代化的 Markdown 编辑器**

*让写作回归纯粹，让创作充满灵感*

[![Release](https://img.shields.io/github/v/release/zhcx/markitdown?style=flat-square)](https://github.com/zhcx/markitdown/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/zhcx/markitdown/releases)

<img src="src-tauri/icons/icon.png" alt="MarkitDown Logo" width="128" height="128">

</div>

---

## 🌟 关于这个项目

> **这是我第一个使用 Claude Code 通过「Vibe Coding」方式创建的项目。**
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
- **沉浸模式** - 类 Typora 的所见即所得体验
- **多标签页** - 同时编辑多个文件
- **语法高亮** - 支持 100+ 编程语言
- **可调节布局** - 自由拖动调整侧边栏和编辑区域宽度

### 🎨 渲染能力
- **数学公式** - KaTeX 渲染，支持行内与块级公式
- **Mermaid 图表** - 流程图、时序图、甘特图等
- **代码高亮** - highlight.js 支持
- **任务列表** - 待办事项管理

### 🎯 界面设计
- **多主题支持** - 浅色主题（Typora 风格）、深色主题（GitHub Dark）、Solarized
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

### 🤖 AI 服务商支持

| 服务商 | 状态 |
| --- | --- |
| OpenAI | 支持 |
| DeepSeek | 支持（含思维链） |
| 硅基流动 (SiliconFlow) | 支持（含思维链） |
| Anthropic | 支持 |
| 自定义 OpenAI 兼容 | 支持 |

### 🔄 自动更新

- 菜单 → 帮助 → 检查更新
- 自动检测 GitHub Release 最新版本
- 一键下载安装包，实时进度显示

### 💾 导出功能
- **HTML 导出** - 自定义模板
- **PDF 导出** - 专业排版输出

---

## 🚀 快速开始

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

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 编辑器引擎 | CodeMirror 6 |
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
│   │   ├── Editor/         # CodeMirror 编辑器
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

## 📄 许可证

[MIT License](LICENSE)

---

<div align="center">

**用 ❤️ 和 Claude Code 构建**

*If you like this project, give it a ⭐!*

</div>
