# WebDAV Backup Handoff

**暂停日期:** 2026-08-21  
**项目:** Zeditor  
**工作区:** `D:\Documents\code\zeditor\.worktrees\webdav-backup`  
**分支:** `feature/webdav-backup`

## 暂停位置

编码暂停在 Task 2 最后一项质量修复之后、Task 3 开始之前。

当前 HEAD 为 `01584c6 fix: accept canonical WebDAV resource paths`。

当前有两处未提交差异：

- `src-tauri/src/webdav/path.rs`
- `src-tauri/src/webdav/manifest.rs`

差异针对字面量百分号文件名：本地 `foo%20bar.md` 应映射为远端 `foo%2520bar.md`，生成路径校验器不应误判为二次编码。差异尚未完成测试、提交和双重审查，接力 Agent 必须先处理。

## 已完成提交

- `4005036 feat: add WebDAV settings schema`
- `53e6a4c feat: model WebDAV backup history`
- `5ed0d2c fix: harden WebDAV path and history models`
- `a5ba3a2 fix: stabilize WebDAV workspace identity`
- `68e7d51 fix: enforce WebDAV history invariants`
- `aa7b937 fix: validate WebDAV persisted namespaces`
- `01584c6 fix: accept canonical WebDAV resource paths`

此前 AI 白屏和窄窗口修复已独立提交为 `5b9dd12`。

## Task 2 已完成内容

已创建并注册以下 Rust 模块：

- `src-tauri/src/webdav/model.rs`
- `src-tauri/src/webdav/path.rs`
- `src-tauri/src/webdav/manifest.rs`
- `src-tauri/src/webdav/mod.rs`

`main.rs` 已声明 `mod webdav;`。

核心 API：

- `validate_endpoint`
- `normalize_remote_root`
- `map_remote_document`
- `sha256_hex`
- `deterministic_version_id`
- `parse_manifest`
- `parse_index`
- `validate_manifest_namespace`
- `validate_index_namespace`
- `DocumentManifest::insert_version`
- `BackupIndex::upsert`

已实现的边界：

- 工作区远端目录使用可读名称加 24 位小写十六进制根路径摘要，避免同名工作区和 32 位摘要碰撞。
- Windows 驱动器、UNC、扩展路径和大小写别名归一化。
- POSIX 反斜杠、尾随空格和双斜杠路径有测试。
- standalone 文件不暴露本地父目录名称。
- 工作区根、历史目录、遍历、查询、片段、编码斜杠和非法百分号均校验。
- 文档 ID 为 24 位小写十六进制；内容 SHA-256 为 64 位小写十六进制。
- 清单按 RFC3339 时间排序，更新保持单调性。
- 历史上限为 20 个不同内容版本，重复/超限快照会返回清理路径。
- 索引和清单命名空间绑定文档 ID、当前文件、manifest、版本目录和快照名称。
- 生成资源路径允许规范编码的 `#`、`?`、空格、Unicode、反斜杠等文件名字符，同时拒绝 `%2F`、遍历和非规范编码。

## 最近验证结果

在 HEAD `01584c6` 上最后一次完整验证：WebDAV Rust 测试 48 项通过，Rust 全套测试 90 项通过，`cargo fmt --check` 通过，严格 all-target/all-features Clippy 通过。

这些结果不包含当前未提交的百分号修复差异，接力 Agent 必须重新执行。

## 接力第一步

先检查 `git status --short` 和两处未提交 diff。

修复目标：

1. 删除“decoded 文本仍包含 `%xx` 就拒绝”的规则。
2. 保留解码后重新规范编码、且必须与原始 segment 完全一致的检查。
3. 保留 `/`、反斜杠、`.`、`..`、控制字符和异常空段拒绝。
4. 保留 `foo%20bar.md` 映射到索引/manifest 并通过命名空间校验的回归测试。

重新执行：`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`、`cargo test --manifest-path src-tauri/Cargo.toml webdav::`、`cargo test --manifest-path src-tauri/Cargo.toml --locked`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings`。

通过后提交 `fix: preserve literal percent filenames`，再重新执行 Task 2 规范审查和代码质量审查。

## 后续执行顺序

完整步骤见 [2026-08-19-webdav-backup.md](../plans/2026-08-19-webdav-backup.md)。

### Task 3 — WebDAV HTTP 客户端

创建 `client.rs`，实现 HTTP/HTTPS、Basic Auth、`MKCOL`、`PUT`、`GET`、`DELETE`、`PROPFIND`、连接测试 probe、超时和错误脱敏。只负责协议，不负责队列、Manager 或 UI。

### Task 4 — 持久队列

创建 `queue.rs`，实现 `webdav-pending.json` 原子保存、同文档任务合并、重试时重新读取本地文件；不保存密码和正文。

### Task 5 — 同步 Manager

创建 `manager.rs`，按“读取本地哈希 → 读取并校验 manifest/index → 上传快照 → manifest → index → 当前副本 → 清理旧快照”执行。必须调用两个命名空间校验 API，不能直接信任远端 JSON 路径。

### Task 6 — Tauri 命令和下载

注册 `webdav_test_connection`、`webdav_enqueue_backup`、`webdav_retry_pending`、`webdav_list_documents`、`webdav_list_versions`、`webdav_download_version`。下载前校验 SHA-256。

### Task 7–10 — 前端状态、保存链路、设置和状态栏

创建 WebDAV 类型、Store、设置、历史弹窗和状态栏组件。保存必须先成功写入本地，再异步入队；云端失败不能使本地保存失败。

### Task 11–12 — 安全、文档、回归和打包

完成错误脱敏、隐私文档、完整 Node/Rust/Lint/Clippy 验证、本地 WebDAV fixture 验证，以及 MSI/NSIS 打包。

## 临时事项

`src-tauri/src/webdav/mod.rs` 当前有模块级 `#![allow(dead_code)]`，用于 Task 3–6 消费 DTO/API 前保持严格 Clippy 通过。Task 6 完成后应删除并重新跑 Clippy。

不要提交 `src-tauri/target`、`src-tauri/target-*`、`node_modules` 或生成 schema。

## 接力验收条件

- 未提交百分号修复完成并通过两道审查。
- 每个 Task 都有 TDD 红灯、实现提交、规范审查和质量审查。
- 当前分支不保留未验证的生产代码。
- 最终 handoff 更新为完成状态，并列出 MSI/NSIS 产物和 SHA-256。
