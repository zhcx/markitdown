mod adapters;
mod git;
mod types;

pub use types::*;

use adapters::{AdapterProtocol, RawApproval};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{Read as _, Write as _},
    path::{Path, PathBuf},
    process::Command as StdCommand,
    process::Stdio,
    sync::{atomic::{AtomicU64, Ordering}, Arc},
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin},
    sync::Mutex,
};
use uuid::Uuid;
use futures_util::StreamExt;

#[derive(Debug, Clone)]
enum PendingChannel {
    Codex(Value),
    Bridge(PathBuf),
    OpenCode { base_url: String, session_id: String, permission_id: String },
}

#[derive(Debug, Clone)]
struct PendingApproval {
    channel: PendingChannel,
    kind: String,
}

struct SessionRuntime {
    session: Mutex<AgentSession>,
    child: Mutex<Option<Child>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    protocol: Mutex<Option<AdapterProtocol>>,
    turn_id: Mutex<String>,
    prompt: Mutex<String>,
    model: Mutex<Option<String>>,
    profile: Mutex<Option<String>>,
    executable: Mutex<Option<PathBuf>>,
    sequence: AtomicU64,
    events: Mutex<Vec<AgentEvent>>,
    pending: Mutex<HashMap<String, PendingApproval>>,
    allowed_kinds: Mutex<std::collections::HashSet<String>>,
    permission_dir: PathBuf,
    opencode_base_url: Mutex<Option<String>>,
}

impl SessionRuntime {
    fn new(session: AgentSession, permission_dir: PathBuf) -> Self {
        Self {
            session: Mutex::new(session),
            child: Mutex::new(None),
            stdin: Arc::new(Mutex::new(None)),
            protocol: Mutex::new(None),
            turn_id: Mutex::new(String::new()),
            prompt: Mutex::new(String::new()),
            model: Mutex::new(None),
            profile: Mutex::new(None),
            executable: Mutex::new(None),
            sequence: AtomicU64::new(0),
            events: Mutex::new(Vec::new()),
            pending: Mutex::new(HashMap::new()),
            allowed_kinds: Mutex::new(std::collections::HashSet::new()),
            permission_dir,
            opencode_base_url: Mutex::new(None),
        }
    }
}

pub struct AgentSupervisor {
    storage_root: PathBuf,
    sessions: Mutex<HashMap<String, Arc<SessionRuntime>>>,
}

impl AgentSupervisor {
    pub fn new(storage_root: PathBuf) -> Self {
        let _ = fs::create_dir_all(storage_root.join("worktrees"));
        let _ = fs::create_dir_all(storage_root.join("permissions"));
        let mut sessions = HashMap::new();
        if let Ok(entries) = fs::read_dir(storage_root.join("sessions")) {
            for entry in entries.flatten() {
                let path = entry.path().join("session.json");
                let Ok(data) = fs::read_to_string(path) else { continue };
                let Ok(mut session) = serde_json::from_str::<AgentSession>(&data) else { continue };
                if matches!(session.status, AgentSessionStatus::Running | AgentSessionStatus::WaitingApproval) {
                    session.status = AgentSessionStatus::Interrupted;
                }
                // Approval bypass is deliberately never restored across app restarts.
                session.approval_mode = AgentApprovalMode::Tiered;
                let permission_dir = storage_root.join("permissions").join(&session.id);
                let runtime = Arc::new(SessionRuntime::new(session.clone(), permission_dir));
                if let Ok(events) = load_events(&storage_root, &session.id) {
                    runtime.sequence.store(events.last().map(|item| item.sequence).unwrap_or(0), Ordering::Relaxed);
                    if let Ok(mut guard) = runtime.events.try_lock() { *guard = events; }
                }
                sessions.insert(session.id.clone(), runtime);
            }
        }
        Self { storage_root, sessions: Mutex::new(sessions) }
    }

    async fn runtime(&self, session_id: &str) -> Result<Arc<SessionRuntime>, String> {
        self.sessions.lock().await.get(session_id).cloned().ok_or_else(|| "找不到 Agent 会话".into())
    }

    async fn persist(&self, runtime: &SessionRuntime) -> Result<(), String> {
        persist_runtime(&self.storage_root, runtime).await
    }
}

async fn persist_runtime(storage_root: &Path, runtime: &SessionRuntime) -> Result<(), String> {
    let session = runtime.session.lock().await.clone();
    let mut persisted_session = session.clone();
    persisted_session.approval_mode = AgentApprovalMode::Tiered;
    let events = runtime.events.lock().await.clone();
    let dir = storage_root.join("sessions").join(&session.id);
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::write(dir.join("session.json"), serde_json::to_vec_pretty(&persisted_session).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    fs::write(dir.join("events.json"), serde_json::to_vec(&events).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    Ok(())
}

fn load_events(storage_root: &Path, session_id: &str) -> Result<Vec<AgentEvent>, String> {
    let path = storage_root.join("sessions").join(session_id).join("events.json");
    if !path.exists() { return Ok(Vec::new()); }
    serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

fn now() -> String { chrono::Utc::now().to_rfc3339() }

fn discover_executable(name: &str) -> Option<PathBuf> {
    let finder = if cfg!(windows) { "where" } else { "which" };
    let output = StdCommand::new(finder).arg(name).output().ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout).lines().find(|line| !line.trim().is_empty()).map(|line| PathBuf::from(line.trim()))
}

fn executable_version(path: &Path) -> Result<String, String> {
    let output = StdCommand::new(path).arg("--version").output().map_err(|error| error.to_string())?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).trim().into()); }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn probe_capabilities(path: &Path, backend: AgentBackendId) -> Result<(), String> {
    let args: &[&str] = match backend {
        AgentBackendId::ClaudeCode => &["-p", "--help"],
        AgentBackendId::Codex => &["app-server", "--help"],
        AgentBackendId::Opencode => &["serve", "--help"],
    };
    let output = StdCommand::new(path).args(args).output().map_err(|error| error.to_string())?;
    let help = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
    let required: &[&str] = match backend {
        AgentBackendId::ClaudeCode => &["stream-json", "--settings"],
        AgentBackendId::Codex => &["app-server", "stdio"],
        AgentBackendId::Opencode => &["hostname", "port"],
    };
    if !output.status.success() || required.iter().any(|needle| !help.contains(needle)) {
        return Err(format!("当前 {} 版本缺少 MarkitDown 所需的流式或审批接口，请升级 CLI", backend.label()));
    }
    Ok(())
}

#[tauri::command]
pub async fn agent_detect_backends(overrides: Option<HashMap<AgentBackendId, String>>) -> Vec<AgentBackendStatus> {
    let overrides = adapters::backend_overrides(overrides);
    [AgentBackendId::ClaudeCode, AgentBackendId::Codex, AgentBackendId::Opencode].into_iter().map(|id| {
        let path = overrides.get(&id).cloned().or_else(|| discover_executable(id.executable_name()));
        let version_result = path.as_deref().map(|path| executable_version(path).and_then(|version| {
            probe_capabilities(path, id)?;
            Ok(version)
        }));
        let installed = path.is_some();
        let (version, diagnostic) = match version_result {
            Some(Ok(value)) => (Some(value), None),
            Some(Err(error)) => (None, Some(format!("无法执行：{error}"))),
            None => (None, Some(format!("未找到 {}，请先安装或指定路径", id.executable_name()))),
        };
        AgentBackendStatus {
            id, label: id.label().into(), installed, executable_path: path.map(|item| item.to_string_lossy().into_owned()),
            compatible: installed && diagnostic.is_none(), diagnostic, version, capabilities: AgentCapabilities::for_backend(id),
        }
    }).collect()
}

#[tauri::command]
pub async fn agent_list_sessions(supervisor: State<'_, AgentSupervisor>) -> Result<Vec<AgentSession>, String> {
    let runtimes: Vec<_> = supervisor.sessions.lock().await.values().cloned().collect();
    let mut sessions = Vec::with_capacity(runtimes.len());
    for runtime in runtimes { sessions.push(runtime.session.lock().await.clone()); }
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

#[tauri::command]
pub async fn agent_get_session_events(session_id: String, supervisor: State<'_, AgentSupervisor>) -> Result<Vec<AgentEvent>, String> {
    Ok(supervisor.runtime(&session_id).await?.events.lock().await.clone())
}

#[tauri::command]
pub async fn agent_start_turn(request: StartAgentTurnRequest, app: AppHandle, supervisor: State<'_, AgentSupervisor>) -> Result<AgentSession, String> {
    if request.prompt.trim().is_empty() { return Err("Agent 任务不能为空".into()); }
    let root = fs::canonicalize(&request.workspace_root).map_err(|error| format!("无法访问工作区：{error}"))?;
    let read_only = git::ensure_git_workspace(&root).is_err();

    // One running turn per workspace, regardless of backend.
    let existing: Vec<_> = supervisor.sessions.lock().await.values().cloned().collect();
    for runtime in existing {
        let item = runtime.session.lock().await;
        if item.workspace_root == root.to_string_lossy() && matches!(item.status, AgentSessionStatus::Running | AgentSessionStatus::WaitingApproval) {
            return Err("当前工作区已有正在运行的 Agent 任务".into());
        }
    }

    let runtime = if let Some(session_id) = request.session_id.as_deref() {
        supervisor.runtime(session_id).await?
    } else {
        let id = Uuid::new_v4().to_string();
        let worktree = if read_only { root.clone() } else { git::session_worktree_path(&supervisor.storage_root, &id) };
        let (base_commit, baseline_hashes) = if read_only {
            (String::new(), HashMap::new())
        } else {
            git::create_isolated_worktree(&root, &worktree)?
        };
        let timestamp = now();
        let session = AgentSession {
            id: id.clone(), backend: request.backend, workspace_root: root.to_string_lossy().into_owned(),
            worktree_path: Some(worktree.to_string_lossy().into_owned()), backend_session_id: None,
            status: AgentSessionStatus::Idle, approval_mode: AgentApprovalMode::Tiered,
            created_at: timestamp.clone(), updated_at: timestamp, last_error: None, has_changes: false,
            read_only,
            base_commit, baseline_hashes,
        };
        let permission_dir = supervisor.storage_root.join("permissions").join(&id);
        fs::create_dir_all(&permission_dir).map_err(|error| error.to_string())?;
        let runtime = Arc::new(SessionRuntime::new(session, permission_dir));
        supervisor.sessions.lock().await.insert(id, runtime.clone());
        runtime
    };

    {
        let mut session = runtime.session.lock().await;
        if session.backend != request.backend { return Err("恢复会话时不能切换 Agent backend".into()); }
        if session.workspace_root != root.to_string_lossy() { return Err("恢复会话时不能切换工作区".into()); }
        session.status = AgentSessionStatus::Running;
        session.updated_at = now();
        session.last_error = None;
    }
    *runtime.prompt.lock().await = request.prompt.clone();
    *runtime.model.lock().await = request.model.clone();
    *runtime.profile.lock().await = request.profile.clone();
    *runtime.turn_id.lock().await = Uuid::new_v4().to_string();

    let executable = request.executable_path.filter(|value| !value.trim().is_empty()).map(PathBuf::from)
        .or_else(|| discover_executable(request.backend.executable_name()))
        .ok_or_else(|| format!("未找到 {}", request.backend.label()))?;
    executable_version(&executable).map_err(|error| format!("{} 不可用：{error}", request.backend.label()))?;
    probe_capabilities(&executable, request.backend)?;
    *runtime.executable.lock().await = Some(executable.clone());

    spawn_turn(runtime.clone(), executable, app.clone(), supervisor.storage_root.clone()).await?;
    supervisor.persist(&runtime).await?;
    let result = runtime.session.lock().await.clone();
    Ok(result)
}

async fn write_json(stdin: &Arc<Mutex<Option<ChildStdin>>>, value: &Value) -> Result<(), String> {
    let mut guard = stdin.lock().await;
    let writer = guard.as_mut().ok_or("Agent 输入通道已关闭")?;
    writer.write_all(value.to_string().as_bytes()).await.map_err(|error| error.to_string())?;
    writer.write_all(b"\n").await.map_err(|error| error.to_string())?;
    writer.flush().await.map_err(|error| error.to_string())
}

async fn spawn_turn(runtime: Arc<SessionRuntime>, executable: PathBuf, app: AppHandle, storage_root: PathBuf) -> Result<(), String> {
    if let Some(mut previous) = runtime.child.lock().await.take() {
        let _ = previous.kill().await;
    }
    let session = runtime.session.lock().await.clone();
    let prompt = runtime.prompt.lock().await.clone();
    let model = runtime.model.lock().await.clone();
    let profile = runtime.profile.lock().await.clone();
    let worktree = PathBuf::from(session.worktree_path.as_deref().ok_or("会话没有隔离工作区")?);
    if session.backend == AgentBackendId::Opencode {
        return spawn_opencode_turn(runtime, executable, app, storage_root, worktree, prompt, model, profile).await;
    }
    let current_exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let mut launch = adapters::build_launch(
        session.backend, &executable, &worktree, &prompt, model.as_deref(), profile.as_deref(), session.approval_mode,
        session.read_only, session.backend_session_id.as_deref(),
        (session.backend == AgentBackendId::ClaudeCode).then_some((current_exe.as_path(), runtime.permission_dir.as_path())),
    )?;
    let protocol = launch.protocol;
    let mut child = launch.command.spawn().map_err(|error| format!("启动 {} 失败：{error}", session.backend.label()))?;
    let stdout = child.stdout.take().ok_or("无法读取 Agent 输出")?;
    let stderr = child.stderr.take().ok_or("无法读取 Agent 错误输出")?;
    *runtime.stdin.lock().await = child.stdin.take();
    *runtime.protocol.lock().await = Some(protocol);
    *runtime.child.lock().await = Some(child);

    if protocol == AdapterProtocol::CodexAppServer {
        write_json(&runtime.stdin, &adapters::codex_initialize()).await?;
        write_json(&runtime.stdin, &adapters::codex_initialized()).await?;
        let thread_request = session.backend_session_id.as_deref().map(adapters::codex_thread_resume)
            .unwrap_or_else(|| adapters::codex_thread_start(&worktree, model.as_deref(), profile.as_deref()));
        write_json(&runtime.stdin, &thread_request).await?;
    }

    let output_runtime = runtime.clone();
    let output_app = app.clone();
    let output_storage = storage_root.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                emit_simple(&output_runtime, &output_app, "command_output", format!("{line}\n")).await;
                continue;
            };
            if protocol == AdapterProtocol::CodexAppServer {
                if let Some(thread_id) = adapters::extract_codex_thread_id(&value) {
                    {
                        let mut metadata = output_runtime.session.lock().await;
                        metadata.backend_session_id = Some(thread_id.clone());
                    }
                    let prompt = output_runtime.prompt.lock().await.clone();
                    let mode = output_runtime.session.lock().await.approval_mode;
                    let read_only = output_runtime.session.lock().await.read_only;
                    let request = adapters::codex_turn_start(&thread_id, &prompt, &worktree, mode, read_only);
                    let _ = write_json(&output_runtime.stdin, &request).await;
                }
            }
            for raw in adapters::line_events(protocol, &value) {
                process_raw_event(&output_runtime, &output_app, raw, protocol).await;
            }
            let _ = persist_runtime(&output_storage, &output_runtime).await;
        }
    });

    let error_runtime = runtime.clone();
    let error_app = app.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit_simple(&error_runtime, &error_app, "command_output", format!("{line}\n")).await;
        }
    });

    if session.backend == AgentBackendId::ClaudeCode {
        tokio::spawn(watch_permission_bridge(runtime.clone(), app.clone()));
    }

    // Non-server adapters exit after one turn. Codex remains alive for resume.
    if protocol != AdapterProtocol::CodexAppServer {
        let monitor_runtime = runtime.clone();
        let monitor_app = app.clone();
        let monitor_storage = storage_root.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(200)).await;
                let result = {
                    let mut child = monitor_runtime.child.lock().await;
                    child.as_mut().and_then(|item| item.try_wait().ok()).flatten()
                };
                if let Some(status) = result {
                    let current = monitor_runtime.session.lock().await.status;
                    if matches!(current, AgentSessionStatus::Running | AgentSessionStatus::WaitingApproval) {
                        if status.success() { finish_session(&monitor_runtime, &monitor_app, AgentSessionStatus::Completed, None).await; }
                        else { finish_session(&monitor_runtime, &monitor_app, AgentSessionStatus::Error, Some(format!("Agent 进程退出：{status}"))).await; }
                        let _ = persist_runtime(&monitor_storage, &monitor_runtime).await;
                    }
                    break;
                }
            }
        });
    }
    Ok(())
}

async fn spawn_opencode_turn(
    runtime: Arc<SessionRuntime>,
    executable: PathBuf,
    app: AppHandle,
    storage_root: PathBuf,
    worktree: PathBuf,
    prompt: String,
    model: Option<String>,
    profile: Option<String>,
) -> Result<(), String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|error| format!("无法分配 OpenCode 端口：{error}"))?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    drop(listener);
    let base_url = format!("http://127.0.0.1:{port}");
    let (mode, read_only) = {
        let session = runtime.session.lock().await;
        (session.approval_mode, session.read_only)
    };
    let mut command = tokio::process::Command::new(executable);
    command.args(["serve", "--hostname", "127.0.0.1", "--port", &port.to_string()])
        .current_dir(&worktree)
        .env("OPENCODE_CONFIG_CONTENT", adapters::opencode_permissions(mode, read_only).to_string())
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    let mut child = command.spawn().map_err(|error| format!("启动 OpenCode server 失败：{error}"))?;
    let stdout = child.stdout.take().ok_or("无法读取 OpenCode 输出")?;
    let stderr = child.stderr.take().ok_or("无法读取 OpenCode 错误输出")?;
    *runtime.protocol.lock().await = Some(AdapterProtocol::OpenCodeJson);
    *runtime.opencode_base_url.lock().await = Some(base_url.clone());
    *runtime.child.lock().await = Some(child);

    let log_runtime = runtime.clone();
    let log_app = app.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if !line.trim().is_empty() { emit_simple(&log_runtime, &log_app, "status", line).await; }
        }
    });
    let error_runtime = runtime.clone();
    let error_app = app.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit_simple(&error_runtime, &error_app, "command_output", format!("{line}\n")).await;
        }
    });

    let client = reqwest::Client::new();
    let mut healthy = false;
    for _ in 0..50 {
        if client.get(format!("{base_url}/global/health")).send().await.is_ok_and(|response| response.status().is_success()) {
            healthy = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    if !healthy { return Err("OpenCode server 启动超时".into()); }

    let existing_id = runtime.session.lock().await.backend_session_id.clone();
    let session_id = if let Some(id) = existing_id {
        id
    } else {
        let response = client.post(format!("{base_url}/session")).json(&json!({"title": "MarkitDown Agent"})).send().await.map_err(|error| error.to_string())?;
        if !response.status().is_success() { return Err(format!("创建 OpenCode 会话失败：{}", response.status())); }
        let body: Value = response.json().await.map_err(|error| error.to_string())?;
        body.get("id").and_then(Value::as_str).ok_or("OpenCode 未返回会话 ID")?.to_string()
    };
    runtime.session.lock().await.backend_session_id = Some(session_id.clone());

    let event_response = client.get(format!("{base_url}/event")).send().await.map_err(|error| format!("订阅 OpenCode 事件失败：{error}"))?;
    if !event_response.status().is_success() { return Err(format!("订阅 OpenCode 事件失败：{}", event_response.status())); }
    let event_runtime = runtime.clone();
    let event_app = app.clone();
    let event_storage = storage_root.clone();
    let event_session_id = session_id.clone();
    tokio::spawn(async move {
        let mut stream = event_response.bytes_stream();
        let mut buffer = String::new();
        while let Some(chunk) = stream.next().await {
            let Ok(chunk) = chunk else { break };
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(position) = buffer.find("\n\n").or_else(|| buffer.find("\r\n\r\n")) {
                let separator_len = if buffer[position..].starts_with("\r\n") { 4 } else { 2 };
                let block = buffer[..position].to_string();
                buffer.drain(..position + separator_len);
                let data = block.lines().filter_map(|line| line.strip_prefix("data:")).map(str::trim).collect::<Vec<_>>().join("\n");
                if data.is_empty() { continue; }
                let Ok(value) = serde_json::from_str::<Value>(&data) else { continue };
                let owner = value.pointer("/properties/sessionID").and_then(Value::as_str);
                if owner.is_some_and(|owner| owner != event_session_id) { continue; }
                for raw in adapters::line_events(AdapterProtocol::OpenCodeJson, &value) {
                    process_raw_event(&event_runtime, &event_app, raw, AdapterProtocol::OpenCodeJson).await;
                }
                let _ = persist_runtime(&event_storage, &event_runtime).await;
            }
        }
    });

    let mut body = json!({"parts": [{"type": "text", "text": prompt}]});
    if let Some(value) = model.filter(|value| !value.is_empty()) {
        let (provider_id, model_id) = value.split_once('/').ok_or("OpenCode 模型覆盖必须使用 provider/model 格式")?;
        body["model"] = json!({"providerID": provider_id, "modelID": model_id});
    }
    if let Some(value) = profile.filter(|value| !value.is_empty()) { body["agent"] = json!(value); }
    let response = client.post(format!("{base_url}/session/{session_id}/prompt_async")).json(&body).send().await.map_err(|error| format!("发送 OpenCode 任务失败：{error}"))?;
    if !response.status().is_success() { return Err(format!("发送 OpenCode 任务失败：{}", response.status())); }
    Ok(())
}

async fn process_raw_event(runtime: &Arc<SessionRuntime>, app: &AppHandle, raw: adapters::RawAgentEvent, protocol: AdapterProtocol) {
    if let Some(id) = raw.backend_session_id.clone() { runtime.session.lock().await.backend_session_id = Some(id); }
    if let Some(turn) = raw.turn_id.clone() { *runtime.turn_id.lock().await = turn; }
    if let Some(approval) = raw.approval {
        let backend_session_id = match raw.backend_session_id.clone() {
            Some(value) => value,
            None => runtime.session.lock().await.backend_session_id.clone().unwrap_or_default(),
        };
        let channel = match protocol {
            AdapterProtocol::CodexAppServer => PendingChannel::Codex(Value::Null),
            AdapterProtocol::OpenCodeJson => {
                let base_url = runtime.opencode_base_url.lock().await.clone().unwrap_or_default();
                let permission_id = approval.backend_request_id.as_str().map(str::to_string).unwrap_or_else(|| approval.backend_request_id.to_string());
                PendingChannel::OpenCode { base_url, session_id: backend_session_id, permission_id }
            },
            AdapterProtocol::ClaudeJson => return,
        };
        handle_approval(runtime, app, approval, channel).await;
        return;
    }
    if raw.kind == "done" {
        if let Some(content) = raw.content.filter(|item| !item.is_empty()) { emit_simple(runtime, app, "message_delta", content).await; }
        finish_session(runtime, app, AgentSessionStatus::Completed, None).await;
        return;
    }
    if raw.kind == "error" {
        finish_session(runtime, app, AgentSessionStatus::Error, raw.content).await;
        return;
    }
    let sequence = runtime.sequence.fetch_add(1, Ordering::Relaxed) + 1;
    let event = AgentEvent {
        session_id: runtime.session.lock().await.id.clone(), turn_id: runtime.turn_id.lock().await.clone(), sequence,
        kind: raw.kind.into(), message: None, content: raw.content, tool_name: raw.tool_name,
        approval: None, payload: raw.payload,
    };
    emit_event(runtime, app, event).await;
}

async fn handle_approval(runtime: &Arc<SessionRuntime>, app: &AppHandle, raw: RawApproval, channel_hint: PendingChannel) {
    let session = runtime.session.lock().await.clone();
    if (session.read_only && raw.kind == "file_change") || is_hard_denied(raw.command.as_deref(), raw.cwd.as_deref(), &session) {
        let channel = if matches!(channel_hint, PendingChannel::Codex(_)) { PendingChannel::Codex(raw.backend_request_id.clone()) } else { channel_hint };
        let _ = respond_channel(runtime, &channel, "deny").await;
        emit_simple(runtime, app, "error", "已阻止越界访问或 Git push 等硬性禁止操作").await;
        return;
    }
    let mode = runtime.session.lock().await.approval_mode;
    let channel = match channel_hint {
        PendingChannel::Codex(_) => PendingChannel::Codex(raw.backend_request_id.clone()),
        other => other,
    };
    if raw.kind == "file_change" || mode == AgentApprovalMode::AllowAllSession || runtime.allowed_kinds.lock().await.contains(&raw.kind) {
        let _ = respond_channel(runtime, &channel, "allow_once").await;
        return;
    }
    let approval_id = Uuid::new_v4().to_string();
    runtime.pending.lock().await.insert(approval_id.clone(), PendingApproval { channel, kind: raw.kind.clone() });
    runtime.session.lock().await.status = AgentSessionStatus::WaitingApproval;
    let sequence = runtime.sequence.fetch_add(1, Ordering::Relaxed) + 1;
    let session_id = runtime.session.lock().await.id.clone();
    let turn_id = runtime.turn_id.lock().await.clone();
    let request = AgentApprovalRequest {
        id: approval_id, session_id: session_id.clone(), turn_id: turn_id.clone(), kind: raw.kind,
        title: raw.title, detail: raw.detail, command: raw.command, cwd: raw.cwd, risk: None,
    };
    emit_event(runtime, app, AgentEvent { session_id, turn_id, sequence, kind: "approval_requested".into(), message: None, content: None, tool_name: None, approval: Some(request), payload: None }).await;
}

fn is_hard_denied(command: Option<&str>, cwd: Option<&str>, session: &AgentSession) -> bool {
    if let Some(command) = command {
        let lowered = command.to_ascii_lowercase();
        if lowered.contains("git push") || lowered.contains("--no-verify push") { return true; }
        if lowered.contains("../") || lowered.contains("..\\") || lowered.contains("$home")
            || lowered.contains("%userprofile%") || lowered.contains("set-location")
            || lowered.contains("pushd ") || lowered.contains("--work-tree")
        { return true; }
        if let Some(worktree) = session.worktree_path.as_deref() {
            let allowed = worktree.replace('\\', "/").to_ascii_lowercase();
            for token in lowered.split_whitespace().map(|item| item.trim_matches(['\'', '"', ';', ',', '(', ')'])) {
                let normalized = token.replace('\\', "/");
                let looks_absolute = (cfg!(not(windows)) && normalized.starts_with('/')) || normalized.as_bytes().get(1) == Some(&b':');
                if looks_absolute && !normalized.starts_with(&allowed) { return true; }
            }
        }
    }
    if let (Some(cwd), Some(worktree)) = (cwd, session.worktree_path.as_deref()) {
        let candidate = PathBuf::from(cwd);
        let existing = if candidate.exists() { candidate } else { candidate.parent().unwrap_or(Path::new(cwd)).to_path_buf() };
        let Ok(cwd) = fs::canonicalize(existing) else { return true };
        let Ok(worktree) = fs::canonicalize(worktree) else { return true };
        if !cwd.starts_with(worktree) { return true; }
    }
    false
}

async fn watch_permission_bridge(runtime: Arc<SessionRuntime>, app: AppHandle) {
    let mut seen = std::collections::HashSet::new();
    loop {
        let status = runtime.session.lock().await.status;
        if !matches!(status, AgentSessionStatus::Running | AgentSessionStatus::WaitingApproval) { break; }
        if let Ok(entries) = fs::read_dir(&runtime.permission_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|value| value.to_str()) != Some("request") { continue; }
                if !seen.insert(path.clone()) { continue; }
                let Ok(data) = fs::read_to_string(&path) else { continue };
                let Ok(value) = serde_json::from_str::<Value>(&data) else { continue };
                let raw = RawApproval {
                    backend_request_id: Value::Null,
                    kind: classify_permission(value.get("tool_name").and_then(Value::as_str)),
                    title: format!("{} 权限请求", value.get("tool_name").and_then(Value::as_str).unwrap_or("Agent")),
                    detail: value.get("input").map(Value::to_string).unwrap_or_default(),
                    command: value.pointer("/input/command").and_then(Value::as_str).map(str::to_string),
                    cwd: value.pointer("/input/cwd").and_then(Value::as_str)
                        .or_else(|| value.pointer("/input/file_path").and_then(Value::as_str))
                        .or_else(|| value.pointer("/input/path").and_then(Value::as_str))
                        .map(str::to_string),
                };
                let response_path = path.with_extension("response");
                handle_approval(&runtime, &app, raw, PendingChannel::Bridge(response_path)).await;
            }
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

fn classify_permission(tool: Option<&str>) -> String {
    match tool.unwrap_or_default().to_ascii_lowercase().as_str() {
        value if value.contains("bash") || value.contains("shell") => "command".into(),
        value if value.contains("write") || value.contains("edit") => "file_change".into(),
        value if value.contains("web") => "network".into(),
        value if value.contains("mcp") => "mcp".into(),
        _ => "other".into(),
    }
}

async fn respond_channel(runtime: &SessionRuntime, channel: &PendingChannel, decision: &str) -> Result<(), String> {
    match channel {
        PendingChannel::Codex(request_id) => write_json(&runtime.stdin, &adapters::codex_approval_response(request_id, decision)).await,
        PendingChannel::Bridge(path) => {
            let allowed = decision != "deny";
            fs::write(path, serde_json::to_vec(&json!({"behavior": if allowed { "allow" } else { "deny" }, "message": if allowed { Value::Null } else { json!("用户拒绝了此操作") }})).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
        }
        PendingChannel::OpenCode { base_url, session_id, permission_id } => {
            let response = match decision {
                "allow_once" => "once",
                "allow_session_kind" | "allow_all_session" => "always",
                _ => "reject",
            };
            let url = format!("{base_url}/session/{session_id}/permissions/{permission_id}");
            let result = reqwest::Client::new().post(url).json(&json!({"response": response, "remember": decision == "allow_session_kind"})).send().await.map_err(|error| error.to_string())?;
            if result.status().is_success() { Ok(()) } else { Err(format!("OpenCode 审批响应失败：{}", result.status())) }
        },
    }
}

#[tauri::command]
pub async fn agent_respond_approval(session_id: String, approval_id: String, decision: String, app: AppHandle, supervisor: State<'_, AgentSupervisor>) -> Result<(), String> {
    let runtime = supervisor.runtime(&session_id).await?;
    let pending = runtime.pending.lock().await.remove(&approval_id).ok_or("审批请求已失效")?;
    if decision == "allow_all_session" { runtime.session.lock().await.approval_mode = AgentApprovalMode::AllowAllSession; }
    if decision == "allow_session_kind" { runtime.allowed_kinds.lock().await.insert(pending.kind.clone()); }
    respond_channel(&runtime, &pending.channel, &decision).await?;
    runtime.session.lock().await.status = AgentSessionStatus::Running;
    let sequence = runtime.sequence.fetch_add(1, Ordering::Relaxed) + 1;
    let turn_id = runtime.turn_id.lock().await.clone();
    emit_event(&runtime, &app, AgentEvent::simple(&session_id, &turn_id, sequence, "approval_resolved", format!("{}：{}", pending.kind, decision))).await;
    supervisor.persist(&runtime).await
}

#[tauri::command]
pub async fn agent_set_approval_mode(session_id: String, mode: AgentApprovalMode, supervisor: State<'_, AgentSupervisor>) -> Result<(), String> {
    let runtime = supervisor.runtime(&session_id).await?;
    runtime.session.lock().await.approval_mode = mode;
    // Do not persist allow_all_session. Tiered is safe to persist.
    if mode == AgentApprovalMode::Tiered { supervisor.persist(&runtime).await?; }
    Ok(())
}

#[tauri::command]
pub async fn agent_cancel_turn(session_id: String, app: AppHandle, supervisor: State<'_, AgentSupervisor>) -> Result<(), String> {
    let runtime = supervisor.runtime(&session_id).await?;
    let protocol = *runtime.protocol.lock().await;
    if protocol == Some(AdapterProtocol::CodexAppServer) {
        let session = runtime.session.lock().await.clone();
        if let Some(thread) = session.backend_session_id {
            let turn = runtime.turn_id.lock().await.clone();
            let _ = write_json(&runtime.stdin, &adapters::codex_interrupt(&thread, &turn)).await;
        }
    } else if protocol == Some(AdapterProtocol::OpenCodeJson) {
        let base_url = runtime.opencode_base_url.lock().await.clone();
        let backend_session_id = runtime.session.lock().await.backend_session_id.clone();
        if let (Some(base_url), Some(backend_session_id)) = (base_url, backend_session_id) {
            let _ = reqwest::Client::new().post(format!("{base_url}/session/{backend_session_id}/abort")).send().await;
        }
    }
    if let Some(mut child) = runtime.child.lock().await.take() { let _ = child.kill().await; }
    finish_session(&runtime, &app, AgentSessionStatus::Interrupted, None).await;
    supervisor.persist(&runtime).await
}

#[tauri::command]
pub async fn agent_get_changes(session_id: String, supervisor: State<'_, AgentSupervisor>) -> Result<AgentChangeSet, String> {
    let runtime = supervisor.runtime(&session_id).await?;
    let mut session = runtime.session.lock().await;
    if session.read_only {
        return Ok(AgentChangeSet { session_id, files: Vec::new(), base_commit: String::new() });
    }
    let changes = git::get_changes(&session)?;
    session.has_changes = !changes.files.is_empty();
    Ok(changes)
}

#[tauri::command]
pub async fn agent_apply_changes(session_id: String, paths: Option<Vec<String>>, supervisor: State<'_, AgentSupervisor>) -> Result<(), String> {
    let runtime = supervisor.runtime(&session_id).await?;
    let mut session = runtime.session.lock().await;
    if session.read_only { return Err("非 Git 工作区会话仅支持只读分析".into()); }
    git::apply_changes(&mut session, paths.as_deref())?;
    let remaining = git::get_changes(&session)?;
    session.has_changes = !remaining.files.is_empty();
    drop(session);
    supervisor.persist(&runtime).await
}

#[tauri::command]
pub async fn agent_discard_session(session_id: String, supervisor: State<'_, AgentSupervisor>) -> Result<(), String> {
    let runtime = supervisor.runtime(&session_id).await?;
    if let Some(mut child) = runtime.child.lock().await.take() { let _ = child.kill().await; }
    let session = runtime.session.lock().await.clone();
    if !session.read_only { git::remove_worktree(&session)?; }
    supervisor.sessions.lock().await.remove(&session_id);
    let _ = fs::remove_dir_all(supervisor.storage_root.join("sessions").join(&session_id));
    let _ = fs::remove_dir_all(supervisor.storage_root.join("permissions").join(&session_id));
    Ok(())
}

async fn emit_simple(runtime: &SessionRuntime, app: &AppHandle, kind: &str, content: impl Into<String>) {
    let sequence = runtime.sequence.fetch_add(1, Ordering::Relaxed) + 1;
    let session_id = runtime.session.lock().await.id.clone();
    let turn_id = runtime.turn_id.lock().await.clone();
    emit_event(runtime, app, AgentEvent::simple(&session_id, &turn_id, sequence, kind, content)).await;
}

async fn emit_event(runtime: &SessionRuntime, app: &AppHandle, event: AgentEvent) {
    runtime.events.lock().await.push(event.clone());
    let _ = app.emit("agent-event", &event);
}

async fn finish_session(runtime: &SessionRuntime, app: &AppHandle, status: AgentSessionStatus, error: Option<String>) {
    {
        let mut session = runtime.session.lock().await;
        session.status = status;
        session.updated_at = now();
        session.last_error = error.clone();
        session.has_changes = !session.read_only && git::get_changes(&session).map(|changes| !changes.files.is_empty()).unwrap_or(false);
    }
    let kind = if status == AgentSessionStatus::Error { "error" } else { "done" };
    emit_simple(runtime, app, kind, error.unwrap_or_default()).await;
}

#[derive(Debug, Serialize, Deserialize)]
struct BridgeRequest {
    bridge_id: String,
    tool_name: String,
    input: Value,
}

/// Claude Code command hook. It exchanges one request through session-scoped
/// files so the GUI remains the sole approval surface without opening a port.
pub fn run_permission_hook(request_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(request_dir).map_err(|error| error.to_string())?;
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).map_err(|error| error.to_string())?;
    let hook_input: Value = serde_json::from_str(&input).map_err(|error| error.to_string())?;
    let bridge_id = Uuid::new_v4().to_string();
    let request = BridgeRequest {
        bridge_id: bridge_id.clone(),
        tool_name: hook_input.get("tool_name").and_then(Value::as_str).unwrap_or("unknown").into(),
        input: hook_input.get("tool_input").cloned().unwrap_or(Value::Null),
    };
    let request_path = request_dir.join(format!("{bridge_id}.request"));
    let response_path = request_dir.join(format!("{bridge_id}.response"));
    fs::write(&request_path, serde_json::to_vec(&request).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let response = loop {
        if response_path.exists() {
            let value = serde_json::from_slice::<Value>(&fs::read(&response_path).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
            let _ = fs::remove_file(&request_path);
            let _ = fs::remove_file(&response_path);
            break value;
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let behavior = response.get("behavior").and_then(Value::as_str).unwrap_or("deny");
    let decision = if behavior == "allow" {
        json!({"behavior": "allow", "updatedInput": request.input})
    } else {
        json!({"behavior": "deny", "message": response.get("message").and_then(Value::as_str).unwrap_or("用户拒绝了此操作")})
    };
    let mut stdout = std::io::stdout();
    writeln!(stdout, "{}", json!({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": decision.get("behavior").and_then(Value::as_str).unwrap_or("deny"), "permissionDecisionReason": decision.get("message").and_then(Value::as_str).unwrap_or("MarkitDown Agent approval"), "updatedInput": decision.get("updatedInput").cloned().unwrap_or(Value::Null)}})).map_err(|error| error.to_string())?;
    stdout.flush().map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hard_boundaries_block_push_and_external_cwd() {
        let session = AgentSession {
            id: "s".into(), backend: AgentBackendId::Codex, workspace_root: "C:\\repo".into(),
            worktree_path: Some(std::env::temp_dir().to_string_lossy().into_owned()), backend_session_id: None,
            status: AgentSessionStatus::Idle, approval_mode: AgentApprovalMode::AllowAllSession,
            created_at: now(), updated_at: now(), last_error: None, has_changes: false, read_only: false,
            base_commit: String::new(), baseline_hashes: HashMap::new(),
        };
        assert!(is_hard_denied(Some("git push origin main"), None, &session));
    }

    #[test]
    fn parses_codex_approval_as_a_unified_event() {
        let value = json!({"id": 7, "method": "item/commandExecution/requestApproval", "params": {"turnId": "t", "command": "npm test", "cwd": "C:/repo", "reason": "run tests"}});
        let events = adapters::line_events(AdapterProtocol::CodexAppServer, &value);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, "approval_requested");
        assert_eq!(events[0].approval.as_ref().and_then(|item| item.command.as_deref()), Some("npm test"));
    }

    #[test]
    fn normalizes_claude_and_opencode_stream_events() {
        let claude = json!({"type": "assistant", "message": {"content": [{"type": "text", "text": "hello"}]}});
        let claude_events = adapters::line_events(AdapterProtocol::ClaudeJson, &claude);
        assert_eq!(claude_events[0].kind, "message_delta");
        assert_eq!(claude_events[0].content.as_deref(), Some("hello"));

        let opencode = json!({"type": "permission.asked", "properties": {"id": "p1", "sessionID": "s1", "permission": "bash", "metadata": {"command": "npm test"}}});
        let opencode_events = adapters::line_events(AdapterProtocol::OpenCodeJson, &opencode);
        let approval = opencode_events[0].approval.as_ref().unwrap();
        assert_eq!(approval.backend_request_id, json!("p1"));
        assert_eq!(approval.command.as_deref(), Some("npm test"));

        assert!(adapters::line_events(AdapterProtocol::OpenCodeJson, &json!({"type": "future.event", "newField": true})).is_empty());
        assert!(serde_json::from_str::<Value>("{truncated").is_err());
    }

    #[test]
    fn non_git_sessions_use_read_only_backend_policies() {
        let permissions = adapters::opencode_permissions(AgentApprovalMode::AllowAllSession, true);
        assert_eq!(permissions.pointer("/permission/edit"), Some(&json!("deny")));
        assert_eq!(permissions.pointer("/permission/bash"), Some(&json!("deny")));

        let turn = adapters::codex_turn_start("thread", "inspect", Path::new("C:/notes"), AgentApprovalMode::AllowAllSession, true);
        assert_eq!(turn.pointer("/params/sandboxPolicy/type"), Some(&json!("readOnly")));
    }

    #[tokio::test]
    async fn allow_all_is_memory_only_when_session_is_persisted() {
        let storage = std::env::temp_dir().join(format!("markitdown-session-test-{}", Uuid::new_v4()));
        let session = AgentSession {
            id: "session".into(), backend: AgentBackendId::ClaudeCode, workspace_root: "repo".into(),
            worktree_path: None, backend_session_id: None, status: AgentSessionStatus::Completed,
            approval_mode: AgentApprovalMode::AllowAllSession, created_at: now(), updated_at: now(),
            last_error: None, has_changes: false, read_only: false, base_commit: String::new(), baseline_hashes: HashMap::new(),
        };
        let runtime = SessionRuntime::new(session, storage.join("permissions"));
        persist_runtime(&storage, &runtime).await.unwrap();
        assert_eq!(runtime.session.lock().await.approval_mode, AgentApprovalMode::AllowAllSession);
        let persisted: AgentSession = serde_json::from_slice(&fs::read(storage.join("sessions/session/session.json")).unwrap()).unwrap();
        assert_eq!(persisted.approval_mode, AgentApprovalMode::Tiered);
        fs::remove_dir_all(storage).unwrap();
    }
}
