import re

with open('docs/releases/v0.3.5.md', 'r', encoding='utf-8') as f:
    content = f.read()

old_start = '### 转换模块使用指南'
old_end = '| SmartScreen 警告 | 点击"更多信息 → 仍要运行" |'

# Find the section boundaries
start_idx = content.find(old_start)
end_idx = content.find(old_end, start_idx)
if end_idx >= 0:
    end_idx = content.index('\n', end_idx) + 1  # include the last line
else:
    print('Could not find section end')
    exit(1)

if start_idx < 0:
    print('Could not find section start')
    exit(1)

new_section = '''### 转换模块使用指南

#### 转换流程示意

```text
用户拖入/右键 PDF 文件
  → 检测模块状态（本机）
  → 已安装          → 直接转换，结果以标签页打开
  → 未安装 + 有网络 → 弹出主题弹窗 → 点击"在线安装"
                      → 检查清单 → 下载平台模块 → 校验 → 安装 → 转换
  → 未安装 + 无网络 → 弹出主题弹窗 → 点击"稍后安装"
                      → 在设置中导入离线 ZIP 包
```

#### 首次安装

转换模块为按需下载的独立组件，首次导入非 Markdown 文件时自动提示安装：

1. 在资源管理器中右键 PDF/DOCX/XLSX/PPTX 文件 → "转换为 Markdown"。
2. 弹出**主题弹窗**，点击"立即安装"从 GitHub Release 下载对应平台组件。
3. 下载完成后自动安装并执行转换，结果以新标签页打开。

也可在 **设置 → 文档转换** 中手动操作：

| 操作 | 按钮 | 说明 |
| --- | --- | --- |
| 在线安装 | "在线安装" | 检查更新后从 GitHub 下载并安装当前平台模块 |
| 导入离线包 | "导入离线包" | 选择本地 ZIP 包导入，适合无网络环境 |
| 卸载模块 | "卸载模块" | 删除已安装的转换模块（弹出确认弹窗） |

#### Python 回退方案

如果本机已安装 Python，更轻量的方式为：

```bash
python -m pip install 'markitdown[pdf,docx,pptx,xlsx]'
```

安装后无需下载转换模块，应用自动识别并调用 Python 回退。如需使用特定的 Python 环境（如 Conda 虚拟环境），在启动应用前设置环境变量：

```bash
# Windows (PowerShell)
$env:MARKITDOWN_PYTHON = "C:\\Users\\xxx\\.conda\\envs\\myenv\\python.exe"
markitdown

# macOS / Linux
MARKITDOWN_PYTHON="/opt/homebrew/bin/python3" ./markitdown
```

#### 支持的转换格式

| 格式 | 说明 | 依赖 |
| --- | --- | --- |
| PDF | 可携带文本的 PDF 文档 | pdfminer / pdfplumber |
| DOCX | Word 文档 | mammoth |
| XLSX | Excel 工作簿 | openpyxl / markitdown |
| PPTX | PowerPoint 演示文稿 | python-pptx |

#### 安全说明

- 文件转换**始终在本机处理**，不上传任何文件到服务器。
- 发布清单使用 Ed25519 签名（公钥编译期嵌入），确保下载来源可信。
- 模块包内可执行文件经过 SHA-256 完整性校验。
- 未设置 `CONVERTER_MANIFEST_PUBLIC_KEY` 时自动跳过 Ed25519 验证，适合自建测试。
- Windows 模块未进行 Authenticode 代码签名，但仍强制验证模块哈希。

#### 故障排除

| 问题 | 可能原因 | 解决方法 |
| --- | --- | --- |
| 提示"converter_module_missing" | 未安装模块且未配置 Python | 安装 Python 回退或在设置中在线安装 |
| 下载转换模块失败 | 网络连接不稳定 | 检查网络，或使用离线包导入 |
| 健康检查失败 | 模块文件损坏 | 重新安装或导入模块 |
| Python 回退不生效 | 未安装 markitdown 库 | 执行 `pip install 'markitdown[pdf,docx,pptx,xlsx]'` |
| 转换结果为空 | 源文件为扫描件/图片 | 确认源文件包含可提取的文本内容 |
| SmartScreen 警告 | 安装包未代码签名 | 点击"更多信息 → 仍要运行" |

'''

content = content[:start_idx] + new_section + content[end_idx:]

with open('docs/releases/v0.3.5.md', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Replaced section from byte {start_idx} to {end_idx}')
print('Done')
