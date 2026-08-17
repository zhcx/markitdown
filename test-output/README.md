# MarkitDown v0.3.4 测试包

基于 `feat/converter-module` 分支构建，包含：

- 🖥️ 桌面应用程序安装包（NSIS/MSI）
- 🔌 文档转换模块插件包（无需签名）
- 🔑 测试签名密钥（可选）

## 文件结构

```text
test-output/
├── README.md
├── bundle/
│   ├── MarkitDown_0.3.4_x64-setup.exe      # NSIS 安装包（推荐，6.4 MB）
│   └── MarkitDown_0.3.4_x64_en-US.msi      # MSI 安装包（静默安装，7.8 MB）
│
└── plugins/
    ├── document-converter-v1.0.0_x86_64-pc-windows-msvc.zip  # 转换模块插件（无签名，75 MB）
    ├── converter-manifest.json             # 模块清单（参考用）
    └── converter-manifest.sig              # 清单 Ed25519 签名（参考用）
```

## 重要变化：签名验证可选

本版本构建**未设置 `CONVERTER_MANIFEST_PUBLIC_KEY`**，转换模块的 Ed25519 签名验证会自动跳过：

| 场景 | 公钥 | 签名验证 |
| --- | --- | --- |
| 本测试包 | ❌ 未配置 | ✅ 自动跳过 |
| Release 构建 | ✅ 已配置 | ✅ 完整验证 |

即使跳过签名，模块仍会执行以下检查：
- SHA-256 文件完整性校验
- 模块元数据格式与协议版本验证
- 健康检查（启动转换器并验证版本信息）

## 测试步骤

### 1. 安装应用

运行 `bundle/MarkitDown_0.3.4_x64-setup.exe` 安装。可选的 MSI 包适用于企业静默部署。

### 2. 测试文档转换模块（导入本地 ZIP）

1. 启动 MarkitDown
2. 在**设置 → 文档转换**中，点击"导入离线包"
3. 选择 `plugins/document-converter-v1.0.0_x86_64-pc-windows-msvc.zip`
4. 导入成功后状态显示 `ready`，受支持格式 `PDF、DOCX、XLSX、PPTX`

### 3. 尝试文档转换

- 在资源管理器中右键点击 PDF/DOCX 文件 → "转换为 Markdown"
- 如果模块未安装，会弹出**主题一致的确认安装弹窗**，点击"立即安装"从 GitHub 下载
- 点击"稍后安装"后会弹出错误弹窗，包含解决建议
- **转换失败时也会弹出主题弹窗**报错，而非仅状态栏文字

### 4. 测试主题弹窗

- 当模块缺失时：弹出**确认安装弹窗**
- 取消安装后：弹出**错误提示弹窗**，包含解决建议
- 设置在卸载模块时：弹出**确认卸载弹窗**
- 弹窗使用 `--ui-bg-overlay`、`--ui-border-strong` 等主题变量，自动适配明暗主题

### 5. 测试资源管理器功能

- 右键上下文菜单：复制、剪切、粘贴、新建文件/文件夹、重命名、删除
- 近期记录面板
- 文件树自动刷新

### 6. Python 回退

> 不需要安装转换模块插件。

```bash
python -m pip install 'markitdown[pdf,docx,pptx,xlsx]'
```

启动 MarkitDown 后自动检测并使用 Python 回退路径。

## 使用签名（可选）

如需启用 Ed25519 签名验证：

```bash
# 1. 生成密钥对
python -c "
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization
import base64

key = ed25519.Ed25519PrivateKey.generate()
pub = key.public_key()
print('Public (base64):', base64.b64encode(
    pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
).decode())
"

# 2. 用公钥重新构建
CONVERTER_MANIFEST_PUBLIC_KEY="<base64公钥>" npm run tauri build
```

## 构建信息

| 项目 | 值 |
| --- | --- |
| 分支 | `feat/converter-module` |
| 版本 | 0.3.4 |
| 构建时间 | 2026-07-23 |
| 公钥 (`CONVERTER_MANIFEST_PUBLIC_KEY`) | 未设置（跳过签名验证） |
| 模块协议版本 | 1 |

## 注意事项

- ⚠️ 安装包**未进行代码签名**（SignPath 暂绕过），SmartScreen 会提示"未知发布者"
- 📦 转换模块（75 MB）为 PyInstaller 打包的 Python 应用，依赖 `markitdown` 库
- 🖥️ macOS/Linux 版本需在其他平台构建
- 🧪 本测试包跳过 Ed25519 签名验证，适合开发测试
