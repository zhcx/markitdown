use super::types::{AgentApprovalMode, AgentBackendId};
use serde_json::{json, Value};
use std::{collections::HashMap, path::{Path, PathBuf}, process::Stdio};
use tokio::process::Command;

pub struct AdapterLaunch {
    pub command: Command,
    pub protocol: AdapterProtocol,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdapterProtocol {
    ClaudeJson,
    CodexAppServer,
    OpenCodeJson,
}

pub fn build_launch(
    backend: AgentBackendId,
    executable: &Path,
    cwd: &Path,
    prompt: &str,
    model: Option<&str>,
    profile: Option<&str>,
    approval_mode: AgentApprovalMode,
    read_only: bool,
    backend_session_id: Option<&str>,
    permission_bridge: Option<(&Path, &Path)>,
) -> Result<AdapterLaunch, String> {
    let mut command = Command::new(executable);
    command.current_dir(cwd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let protocol = match backend {
        AgentBackendId::ClaudeCode => {
            command.args(["-p", "--output-format", "stream-json", "--input-format", "text", "--verbose"]);
            command.args(["--permission-mode", if read_only { "plan" } else { "manual" }]);
            if let Some(value) = model.filter(|value| !value.is_empty()) { command.args(["--model", value]); }
            if let Some(value) = profile.filter(|value| !value.is_empty()) { command.args(["--agent", value]); }
            if let Some(value) = backend_session_id.filter(|value| !value.is_empty()) { command.args(["--resume", value]); }
            if let Some((exe, request_dir)) = permission_bridge {
                let hook_command = format!("\"{}\" --agent-permission-hook \"{}\"", exe.display(), request_dir.display());
                let settings = json!({
                    "hooks": {
                        "PreToolUse": [{
                            "matcher": "Bash|Write|Edit|MultiEdit|NotebookEdit|WebFetch|WebSearch|mcp__.*",
                            "hooks": [{"type": "command", "command": hook_command, "timeout": 86400}]
                        }]
                    }
                });
                command.args(["--settings", &settings.to_string()]);
            }
            command.arg(prompt);
            AdapterProtocol::ClaudeJson
        }
        AgentBackendId::Codex => {
            command.args(["app-server", "--stdio"]);
            AdapterProtocol::CodexAppServer
        }
        AgentBackendId::Opencode => {
            command.args(["run", "--format", "json"]);
            if let Some(value) = model.filter(|value| !value.is_empty()) { command.args(["--model", value]); }
            command.arg(prompt);
            command.env("OPENCODE_CONFIG_CONTENT", opencode_permissions(approval_mode, read_only).to_string());
            AdapterProtocol::OpenCodeJson
        }
    };
    command.kill_on_drop(true);
    Ok(AdapterLaunch { command, protocol })
}

pub fn opencode_permissions(mode: AgentApprovalMode, read_only: bool) -> Value {
    let ask = if mode == AgentApprovalMode::AllowAllSession { "allow" } else { "ask" };
    json!({
        "permission": {
            "read": "allow",
            "edit": if read_only { "deny" } else { "allow" },
            "bash": if read_only { json!("deny") } else { json!({
                "*": ask,
                "git push*": "deny"
            }) },
            "webfetch": ask,
            "websearch": ask,
            "external_directory": "deny"
        }
    })
}

pub fn codex_initialize() -> Value {
    json!({"id": 1, "method": "initialize", "params": {
        "clientInfo": {"name": "markitdown", "title": "MarkitDown", "version": env!("CARGO_PKG_VERSION")},
        "capabilities": {"experimentalApi": true}
    }})
}

pub fn codex_initialized() -> Value {
    json!({"method": "initialized", "params": {}})
}

pub fn codex_thread_start(cwd: &Path, model: Option<&str>, profile: Option<&str>) -> Value {
    let mut params = json!({"cwd": cwd, "ephemeral": false});
    if let Some(value) = model.filter(|value| !value.is_empty()) { params["model"] = json!(value); }
    if let Some(value) = profile.filter(|value| !value.is_empty()) { params["configProfile"] = json!(value); }
    json!({"id": 2, "method": "thread/start", "params": params})
}

pub fn codex_thread_resume(thread_id: &str) -> Value {
    json!({"id": 2, "method": "thread/resume", "params": {"threadId": thread_id}})
}

pub fn codex_turn_start(thread_id: &str, prompt: &str, cwd: &Path, mode: AgentApprovalMode, read_only: bool) -> Value {
    json!({"id": 3, "method": "turn/start", "params": {
        "threadId": thread_id,
        "input": [{"type": "text", "text": prompt}],
        "cwd": cwd,
        "approvalPolicy": if mode == AgentApprovalMode::AllowAllSession { "never" } else { "on-request" },
        "sandboxPolicy": if read_only {
            json!({"type": "readOnly", "networkAccess": mode == AgentApprovalMode::AllowAllSession})
        } else {
            json!({"type": "workspaceWrite", "writableRoots": [cwd], "networkAccess": mode == AgentApprovalMode::AllowAllSession})
        }
    }})
}

pub fn codex_interrupt(thread_id: &str, turn_id: &str) -> Value {
    json!({"id": 90, "method": "turn/interrupt", "params": {"threadId": thread_id, "turnId": turn_id}})
}

pub fn codex_approval_response(request_id: &Value, decision: &str) -> Value {
    let mapped = match decision {
        "allow_once" => "accept",
        "allow_session_kind" | "allow_all_session" => "acceptForSession",
        _ => "decline",
    };
    json!({"id": request_id, "result": {"decision": mapped}})
}

pub fn extract_codex_thread_id(value: &Value) -> Option<String> {
    value.get("result")?.get("thread")?.get("id")?.as_str().map(str::to_string)
}

pub fn line_events(protocol: AdapterProtocol, value: &Value) -> Vec<RawAgentEvent> {
    match protocol {
        AdapterProtocol::ClaudeJson => claude_events(value),
        AdapterProtocol::CodexAppServer => codex_events(value),
        AdapterProtocol::OpenCodeJson => opencode_events(value),
    }
}

#[derive(Debug, Clone)]
pub struct RawAgentEvent {
    pub kind: &'static str,
    pub content: Option<String>,
    pub tool_name: Option<String>,
    pub approval: Option<RawApproval>,
    pub payload: Option<Value>,
    pub turn_id: Option<String>,
    pub backend_session_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RawApproval {
    pub backend_request_id: Value,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub command: Option<String>,
    pub cwd: Option<String>,
}

fn event(kind: &'static str, content: impl Into<String>) -> RawAgentEvent {
    RawAgentEvent { kind, content: Some(content.into()), tool_name: None, approval: None, payload: None, turn_id: None, backend_session_id: None }
}

fn claude_events(value: &Value) -> Vec<RawAgentEvent> {
    let event_type = value.get("type").and_then(Value::as_str).unwrap_or_default();
    match event_type {
        "assistant" => value.pointer("/message/content").and_then(Value::as_array).into_iter().flatten().filter_map(|part| {
            match part.get("type").and_then(Value::as_str) {
                Some("text") => Some(event("message_delta", part.get("text")?.as_str()?)),
                Some("tool_use") => Some(RawAgentEvent { kind: "tool_started", content: part.get("input").map(Value::to_string), tool_name: part.get("name").and_then(Value::as_str).map(str::to_string), approval: None, payload: Some(part.clone()), turn_id: None, backend_session_id: None }),
                _ => None,
            }
        }).collect(),
        "stream_event" => {
            let delta = value.pointer("/event/delta/text").and_then(Value::as_str)
                .or_else(|| value.pointer("/event/delta/thinking").and_then(Value::as_str));
            delta.map(|text| vec![event("message_delta", text)]).unwrap_or_default()
        }
        "result" => vec![RawAgentEvent { kind: if value.get("is_error").and_then(Value::as_bool).unwrap_or(false) { "error" } else { "done" }, content: value.get("result").and_then(Value::as_str).map(str::to_string), tool_name: None, approval: None, payload: Some(value.clone()), turn_id: None, backend_session_id: value.get("session_id").and_then(Value::as_str).map(str::to_string) }],
        _ => Vec::new(),
    }
}

fn codex_events(value: &Value) -> Vec<RawAgentEvent> {
    let method = value.get("method").and_then(Value::as_str).unwrap_or_default();
    let params = value.get("params").cloned().unwrap_or(Value::Null);
    let turn_id = params.get("turnId").and_then(Value::as_str).map(str::to_string)
        .or_else(|| params.pointer("/turn/id").and_then(Value::as_str).map(str::to_string));
    match method {
        "item/agentMessage/delta" => vec![RawAgentEvent { kind: "message_delta", content: params.get("delta").and_then(Value::as_str).map(str::to_string), tool_name: None, approval: None, payload: None, turn_id, backend_session_id: None }],
        "item/reasoning/summaryTextDelta" | "item/reasoning/textDelta" => vec![RawAgentEvent { kind: "reasoning_delta", content: params.get("delta").and_then(Value::as_str).map(str::to_string), tool_name: None, approval: None, payload: None, turn_id, backend_session_id: None }],
        "item/started" => vec![RawAgentEvent { kind: "tool_started", content: params.get("item").map(Value::to_string), tool_name: params.pointer("/item/type").and_then(Value::as_str).map(str::to_string), approval: None, payload: Some(params), turn_id, backend_session_id: None }],
        "item/completed" => vec![RawAgentEvent { kind: "tool_completed", content: params.get("item").map(Value::to_string), tool_name: params.pointer("/item/type").and_then(Value::as_str).map(str::to_string), approval: None, payload: Some(params), turn_id, backend_session_id: None }],
        "item/commandExecution/outputDelta" => vec![RawAgentEvent { kind: "command_output", content: params.get("delta").and_then(Value::as_str).map(str::to_string), tool_name: Some("command".into()), approval: None, payload: None, turn_id, backend_session_id: None }],
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => {
            let command = params.get("command").map(|item| if item.is_string() { item.as_str().unwrap_or_default().into() } else { item.to_string() });
            vec![RawAgentEvent {
                kind: "approval_requested", content: None, tool_name: None,
                approval: Some(RawApproval {
                    backend_request_id: value.get("id").cloned().unwrap_or(Value::Null),
                    kind: if method.contains("commandExecution") { "command".into() } else { "file_change".into() },
                    title: if method.contains("commandExecution") { "执行命令".into() } else { "应用文件修改".into() },
                    detail: params.get("reason").and_then(Value::as_str).unwrap_or("Agent 请求权限").into(),
                    command,
                    cwd: params.get("cwd").and_then(Value::as_str).map(str::to_string),
                }), payload: Some(params), turn_id, backend_session_id: None,
            }]
        }
        "turn/completed" => vec![RawAgentEvent { kind: "done", content: None, tool_name: None, approval: None, payload: Some(params), turn_id, backend_session_id: None }],
        "error" => vec![event("error", params.to_string())],
        _ => Vec::new(),
    }
}

fn opencode_events(value: &Value) -> Vec<RawAgentEvent> {
    let event_type = value.get("type").and_then(Value::as_str).unwrap_or_default();
    let properties = value.get("properties").unwrap_or(value);
    let part = value.get("part").or_else(|| properties.get("part"));
    match event_type {
        "text" => vec![event("message_delta", value.get("text").and_then(Value::as_str).unwrap_or_default())],
        "tool_use" | "tool" => vec![RawAgentEvent { kind: "tool_started", content: value.get("input").map(Value::to_string), tool_name: value.get("name").and_then(Value::as_str).map(str::to_string), approval: None, payload: Some(value.clone()), turn_id: None, backend_session_id: None }],
        "message.part.updated" => properties.get("delta").and_then(Value::as_str)
            .or_else(|| part.and_then(|item| item.get("text")).and_then(Value::as_str))
            .map(|text| vec![event("message_delta", text)]).unwrap_or_default(),
        "permission.asked" => vec![RawAgentEvent { kind: "approval_requested", content: None, tool_name: None, approval: Some(RawApproval { backend_request_id: properties.get("id").cloned().unwrap_or(Value::Null), kind: properties.get("permission").and_then(Value::as_str).unwrap_or("other").into(), title: "OpenCode 权限请求".into(), detail: properties.get("metadata").map(Value::to_string).unwrap_or_else(|| properties.to_string()), command: properties.pointer("/metadata/command").and_then(Value::as_str).map(str::to_string), cwd: None }), payload: Some(value.clone()), turn_id: None, backend_session_id: properties.get("sessionID").and_then(Value::as_str).map(str::to_string) }],
        "session.idle" | "result" => vec![RawAgentEvent { kind: "done", content: properties.get("text").and_then(Value::as_str).map(str::to_string), tool_name: None, approval: None, payload: Some(value.clone()), turn_id: None, backend_session_id: properties.get("sessionID").and_then(Value::as_str).map(str::to_string) }],
        "error" | "session.error" => vec![event("error", value.to_string())],
        _ => Vec::new(),
    }
}

pub fn backend_overrides(input: Option<HashMap<AgentBackendId, String>>) -> HashMap<AgentBackendId, PathBuf> {
    input.unwrap_or_default().into_iter().filter_map(|(key, value)| (!value.trim().is_empty()).then(|| (key, PathBuf::from(value)))).collect()
}
