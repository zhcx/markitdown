# WebDAV + S3 云备份 Handoff（详细版）

**生成日期:** 2026-08-21  
**项目:** Zeditor（Markdown 编辑器，Tauri 2 + React 18 + Rust 2021）  
**分支:** `feature/webdav-backup`（含 WebDAV 与 S3 云同步完整功能）  
**工作区（worktree）:** `D:\Documents\code\zeditor\.worktrees\webdav-backup`  
**主仓库:** `D:\Documents\code\zeditor`（main 分支，`3a14b36`）  
**远端:** `origin` = `https://github.com/zhcx/zeditor.git`（已推送，已设 upstream）

---

## 1. 分支状态

| 项 | 值 |
|---|---|
| 分支名 | `feature/webdav-backup` |
| 最新提交 | `06694ce feat: redesign cloud sync menu matching AI menu visual language` |
| 相对 main 提交数 | 40 个（含 3 个文档/规划基线提交） |
| 合并基线 | `1158a47 merge: integrate release-v0.3.8 into main`（origin/main HEAD） |
| 工作树 | 干净（无未提交改动；打包后需 `git checkout -- src-tauri/Cargo.toml` 恢复行尾噪音） |
| upstream | 已设置 `origin/feature/webdav-backup` |
| 合并方式 | **暂不合并**，待功能完善后创建 PR 合并到 main |

**后续接力第一步：** 在 worktree 目录直接 `git pull` / `git push` 即可同步。

---

## 2. 功能总览

### 2.1 WebDAV 文档备份（完整）
- 桌面版单向备份：本地保存成功后异步上传，保留最新副本 + 最近 20 个不同内容版本（SHA-256 去重）
- 设置项：服务器地址、用户名、密码/应用密码、远端根目录（默认 `/Zeditor`）、连接测试（写读删探针）
- 失败任务持久化（`webdav-pending.json`），重启/下次保存/手动重试恢复
- 状态栏实时状态 + 历史浏览 + 另存为下载（下载前 Rust 侧校验 SHA-256）

### 2.2 S3 兼容对象存储同步（完整）
- 手写 AWS SigV4 签名（`sigv4.rs`，从图床 `image/s3.rs` 泛化），支持 GET/PUT/DELETE/HEAD
- 支持 Path-Style（MinIO/自建）与 Virtual-Hosted（AWS/OSS/COS/R2 等云端）
- 设置项：Endpoint、Bucket、Region、Access Key、Secret Key、Path-Style 开关、远端根目录（对象前缀）
- 独立队列 `s3-pending.json`，与 WebDAV 完全并行

### 2.3 统一「云同步」UI
- **设置页**：WebDAV 与 S3 合并为单个「云同步」tab，内部两个分区各自独立开关
- **状态栏**：单个「云同步」项（AI 触发器同款交互），任一后端启用即显示已启用
  - 点击弹出菜单（仿 AI 写作助手菜单）：标题+动态副标题、每个后端状态行（图标块+主副文字）、行内胶囊开关、整行点击打开历史、底部设置入口
  - 点击空白处/Esc 关闭菜单
- **事件**：`webdav-sync-status` 通道带 `provider` 字段（`"webdav"`/`"s3"`），前端按 provider 过滤

---

## 3. 架构与关键文件

### 3.1 Rust 后端（`src-tauri/src/webdav/`）

| 文件 | 职责 |
|---|---|
| `model.rs` | DTO：`WebDavSettings`、`S3Settings`、`DocumentManifest`、`BackupIndex`、`PendingBackupTask`、`WebDavSyncEvent`（含 provider 字段）等 |
| `path.rs` | 端点校验、路径归一化、文档映射（工作区/Standalone）、SHA-256、`history_index_path`/`document_manifest_path`/`document_versions_dir` |
| `client.rs` | `WebDavClient`（MKCOL/PUT/GET/DELETE/PROPFIND）、`RemoteSyncClient` trait、`RemoteClient` 枚举（WebDav/S3 分发）、错误脱敏、`TestDavServer` 测试夹具 |
| `s3.rs` | `S3Client`：SigV4 签名请求、Path-Style/Virtual-Host URL、对象键映射、探针连接测试 |
| `sigv4.rs` | 通用 AWS SigV4 签名（`SigningContext` + `authorization()`） |
| `manifest.rs` | 清单/索引解析、命名空间校验、去重/20 版本保留 |
| `queue.rs` | `PendingTaskStore` 原子持久化（temp+rename） |
| `manager.rs` | `WebDavSyncManager`/`S3SyncManager`（newtype 共享内部 worker）、`enqueue_impl`/`process_impl`/`sync_task` 协议无关事务 |
| `mod.rs` | 12 个 Tauri 命令（webdav_*/s3_* 各 6 个）、`TauriWebDavEventSink` |

**同步事务顺序**（`sync_task`，协议无关）：
1. 读本地字节 → 刷新 hash/version_id
2. 读远端 manifest（校验命名空间，不信任路径）
3. hash 相同则跳过快照；否则 PUT 快照 → 更新 manifest → PUT manifest
4. 读/校验全局 index → upsert → PUT index
5. PUT 当前副本（WebDAV 先 ensure_collection，S3 no-op）
6. 清理被修剪的快照（best-effort）
7. 成功才移除队列任务；失败保留可幂等重试

**Tauri 命令（12 个）**：
`webdav_test_connection` / `webdav_enqueue_backup` / `webdav_retry_pending` / `webdav_list_documents` / `webdav_list_versions` / `webdav_download_version`
`s3_test_connection` / `s3_enqueue_backup` / `s3_retry_pending` / `s3_list_documents` / `s3_list_versions` / `s3_download_version`

### 3.2 前端

| 文件 | 职责 |
|---|---|
| `src/types/webdav.ts` | `WebDavSettings`、`S3Settings`、`WebDavSyncEvent`（provider 可选）、DTO 镜像 |
| `src/utils/webdavState.ts` | `reduceWebDavStatus`（按 provider+document 过滤）、`webDavStatusLabel`（五态中文） |
| `src/stores/webdavStore.ts` | WebDAV store（listener 过滤 provider='webdav'，webdav_* 命令） |
| `src/stores/s3Store.ts` | S3 store（listener 过滤 provider='s3'，s3_* 命令） |
| `src/stores/appStore.ts` | Settings 含 webdav/s3 三件套（类型/default/normalize）、SettingsTab 含 'cloud'、saveTab 双 enqueue |
| `src/components/WebDav/WebDavSettings.tsx` | WebDAV 配置表单（开关/字段/测试连接/浏览历史） |
| `src/components/WebDav/S3Settings.tsx` | S3 配置表单 |
| `src/components/WebDav/WebDavHistoryDialog.tsx` | 历史弹窗（provider 参数化，复用两 store） |
| `src/components/WebDav/WebDavStatusItem.tsx` | 状态栏「云同步」聚合项 + 菜单（AI 菜单同构） |
| `src/components/StatusBar/StatusBar.tsx` | 云同步项放在 statusbar-left（AI/校对/伴写同排，`|` 分隔），`updateCloudProvider` 直接启停 |
| `src/components/Settings/SettingsPanel.tsx` | 'cloud' tab 渲染两分区、云图标 |
| `src/App.tsx` | 启动 initialize 双 store、currentFile 同步双 store |

**保存链路**（`appStore.saveTab`）：本地 `save_file_content` 成功后 → `void invoke('webdav_enqueue_backup')` + `void invoke('s3_enqueue_backup')`（均不 await，云端失败不影响本地保存）。

---

## 4. 验证状态

| 验证项 | 结果 |
|---|---|
| Rust 测试 | ✅ 137 通过（`cargo test --locked`） |
| Node 测试 | ✅ 128 通过（`npm test`） |
| cargo fmt | ✅ |
| Clippy（strict all-targets/all-features） | ✅ |
| ESLint | ✅ |
| tsc / Vite build | ✅ |
| 打包 | ✅ MSI + NSIS（见 §6） |

---

## 5. 已知问题与待办

### 5.1 待实测（功能已实现，需真实环境验证）
- [ ] **S3 端到端**：MinIO 本地实例与任一云服务（OSS/COS/R2）实测连接测试、保存同步、历史下载
- [ ] **飞牛 NAS WebDAV**：MKCOL 尾斜杠修复 + 405 后 PROPFIND 验证的实测（需用户在 NAS 确认：目录已存在时自动建目录是否成功；根目录不存在时提示手动创建）
- [ ] 双后端同时启用时的端到端（保存→双队列→双状态栏状态）

### 5.2 已知限制 / 注意事项
- **打包后行尾噪音**：`npm run tauri build` 会改写 `src-tauri/Cargo.toml` 行尾（LF→CRLF），提交前需 `git checkout -- src-tauri/Cargo.toml`
- **打包锁文件**：zeditor.exe 运行时 release 构建会因文件占用失败（NSIS），打包前需关闭应用
- **S3 无目录概念**：`ensure_collection` 为 no-op（对象存储扁平命名空间），remote_root 仅作 key 前缀
- **WebDAV 错误脱敏**：未知状态码不回显服务器文本（防凭据/内容泄漏），诊断由 test_connection 分步骤提供（建目录/上传/读取/删除）
- **浏览器预览（非 Tauri）**：云同步 UI 可显示但入队/测试/下载均被 `isTauriRuntime()` 守卫跳过

### 5.3 后续完善候选
- [ ] S3 分片上传（>50MB 文档）——当前 PUT 单请求，受服务器限制
- [ ] 手动「立即同步」按钮（当前仅保存触发 + 重试）
- [ ] 云同步菜单展示最近一次同步时间/进度百分比
- [ ] 设置迁移测试：老 settings.json（无 webdav/s3）读取兼容性回归

---

## 6. 打包产物（最新，16:37）

| 产物 | 大小 | SHA-256 |
| --- | --- | --- |
| `src-tauri/target/release/bundle/msi/Zeditor_0.3.8_x64_en-US.msi` | 8,413,184 | `86239B8B8BA2EB75CA895E585D07E4FB4C8F4B3F34D62577816B6F6E8C613ECF` |
| `src-tauri/target/release/bundle/nsis/Zeditor_0.3.8_x64-setup.exe` | 6,928,897 | `047348E12BD3AE21EF468235CD3DEC441911B6A90F67F525CE858FF00CCCF685` |

---

## 7. 完整提交历史（40 个，含基线）

### 云同步菜单重设计 / 优化
```
06694ce feat: redesign cloud sync menu matching AI menu visual language
8e935b1 feat: enhance cloud sync menu with outside-click close and inline toggles
47251e8 fix: cloud sync menu positioning and status bar placement
f3380b2 feat: merge WebDAV and S3 into unified cloud sync UI
```

### S3 云同步
```
35a77a7 docs: explain WebDAV and S3 document backup
aa4dc63 feat: add S3 sync settings store and status UI
ecce8ca feat: add S3 backup manager commands and settings
2a41c76 feat: add S3-compatible sync client with SigV4 signing
```

### WebDAV 完善（NAS 兼容 + UI + 打包）
```
d6ff732 fix: use trailing-slash MKCOL and preserve endpoint subpath
57facf1 fix: adapt MKCOL 405 handling for NAS WebDAV
709bc09 docs: update final installer hashes
6e88a26 feat: adapt WebDAV UI to theme with switch and status redesign
1679971 feat: polish WebDAV settings buttons and connection diagnostics
a9bd53c docs: mark WebDAV backup handoff complete
5f9a0c6 docs: explain WebDAV document backup
20482d2 fix: harden WebDAV backup boundaries
0ad2b3d feat: show WebDAV sync status and history
56a5584 feat: add WebDAV backup settings
f6db53b feat: queue WebDAV backup after saving
88eea85 feat: track WebDAV synchronization state
0f103b0 test: point WebDAV settings test at model location
4d08769 feat: expose WebDAV backup commands
b57c37e feat: synchronize WebDAV backups
cef9a3a feat: persist WebDAV backup queue
f6c0e94 feat: add WebDAV protocol client
6d0d3c2 fix: preserve literal percent filenames
5aba052 docs: add WebDAV backup handoff
01584c6 fix: accept canonical WebDAV resource paths
aa7b937 fix: validate WebDAV persisted namespaces
68e7d51 fix: enforce WebDAV history invariants
a5ba3a2 fix: stabilize WebDAV workspace identity
5ed0d2c fix: harden WebDAV path and history models
53e6a4c feat: model WebDAV backup history
4005036 feat: add WebDAV settings schema
```

### 基线
```
3a14b36 chore: ignore local worktrees
5b9dd12 fix: stabilize AI panel settings and narrow layout
b3883f1 docs: plan WebDAV document backup
925aaa6 docs: design WebDAV document backup
```

---

## 8. 环境信息（接力工具需要）

- **OS**: Windows 10 IoT Enterprise LTSC 2021（x64）
- **Node**: >= 22.6；**Rust**: >= 1.85
- **构建**: `npm run tauri build`（release，约 6-9 分钟；打包前确认 zeditor 未运行）
- **测试**: Rust `cargo test --manifest-path src-tauri/Cargo.toml --locked`；Node `npm test`（node --test tests/*.test.ts）
- **Lint/Build**: `npm run lint` / `npm run build`
- **前端测试模式**: Node 内置 test runner + 源码正则断言（无 jsdom）；测试文件 `tests/webdavSettings.test.ts`、`tests/webdavIntegration.test.ts`、`tests/securityHardening.test.ts`

---

## 9. 交接验收清单（接力工具开始前）

- [ ] `git status --short` 干净（若 Cargo.toml 有行尾改动 → `git checkout -- src-tauri/Cargo.toml`）
- [ ] `git pull`（若有远端更新）
- [ ] 确认分支 `feature/webdav-backup`
- [ ] 如需打包：先关闭运行中的 zeditor.exe，再 `npm run tauri build`
- [ ] 改动提交后 `git push`（upstream 已配置）
