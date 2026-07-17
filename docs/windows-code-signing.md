# Windows 安装包签名配置

MarkitDown 的 Windows 发布包必须使用受 Windows 信任的 Authenticode 代码签名证书。CI 会同时签名内置的 `document_converter.exe`、主程序、NSIS 安装包和 MSI；缺少证书时 Windows 发布任务会直接失败，避免再次上传“发布者未知”的安装包。

## GitHub Actions Secrets

准备一个包含私钥的 PFX 代码签名证书，然后在仓库的 **Settings → Secrets and variables → Actions** 中添加：

- `WINDOWS_CERTIFICATE_BASE64`：PFX 文件的 Base64 内容；
- `WINDOWS_CERTIFICATE_PASSWORD`：PFX 密码。

在 Windows PowerShell 中生成 Base64 内容：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\codesign.pfx")) | Set-Clipboard
```

不要把 PFX、密码或生成的 `src-tauri/tauri.windows-signing.conf.json` 提交到仓库。后者只由 CI 临时生成，并已被忽略。

## 验证发布包

发布完成后可在 Windows PowerShell 中检查下载文件：

```powershell
Get-AuthenticodeSignature .\MarkitDown_0.3.0_x64-setup.exe | Format-List Status,SignerCertificate,TimeStamperCertificate
```

`Status` 必须为 `Valid`，签名者应是证书登记的个人或组织名称，并且应有时间戳证书。首次使用新证书发布时，SmartScreen 信誉仍可能需要一段时间积累；保持同一证书、产品名和官方 HTTPS 下载来源有助于建立稳定信誉。

