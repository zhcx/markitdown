mod client;
mod prompts;

use tauri::WebviewWindow;

use crate::commands::{self, AISettings};

pub use client::AIResponse;

/// 将 AI 操作隔离到独立 tokio task 中，通过 JoinError 捕获 panic，
/// 防止 hyper/reqwest 内部 panic 导致进程死亡。
async fn run_ai_action_safely(
    action: String,
    content: String,
    context: Option<String>,
    settings: AISettings,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    doc_context: Option<String>,
    doc_title: Option<String>,
    skill_context: Option<String>,
    enable_thinking: bool,
) -> Result<AIResponse, String> {
    let action_for_log = action.clone();
    let handle = tokio::task::spawn(async move {
        match action.as_str() {
            "proofread" => client::proofread(&content, &settings).await,
            "companion" => client::companion(&content, context.as_deref(), &settings).await,
            "rewrite" => client::rewrite(&content, &settings).await,
            "translate" => client::translate(&content, context.as_deref(), &settings).await,
            "summarize" => client::summarize(&content, &settings).await,
            "outline" => client::outline(&content, &settings).await,
            "chat" => client::chat(&content, context.as_deref(), &settings, temperature, max_tokens, doc_context, doc_title, skill_context, enable_thinking).await,
            _ => Err(format!("未知的AI操作: {}", action)),
        }
    });

    match handle.await {
        Ok(result) => result,
        Err(join_error) => {
            let msg = if join_error.is_panic() {
                let payload = join_error.into_panic();
                let info = payload
                    .downcast_ref::<&str>()
                    .map(|s| (*s).to_string())
                    .or_else(|| payload.downcast_ref::<String>().cloned())
                    .unwrap_or_else(|| "unknown panic".to_string());
                format!("[{}] task panic: {}", action_for_log, info)
            } else {
                format!("[{}] task cancelled: {}", action_for_log, join_error)
            };
            eprintln!("{}", msg);
            commands::log_to_file(&msg);
            Err(msg)
        }
    }
}

#[tauri::command]
pub async fn ai_request(
    action: String,
    content: String,
    context: Option<String>,
    settings: AISettings,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    doc_context: Option<String>,
    doc_title: Option<String>,
    skill_context: Option<String>,
    enable_thinking: Option<bool>,
) -> Result<AIResponse, String> {
    if !settings.enabled {
        return Err("AI功能未启用".to_string());
    }

    if settings.api_key.is_empty() {
        return Err("请先配置API密钥".to_string());
    }

    run_ai_action_safely(
        action,
        content,
        context,
        settings,
        temperature,
        max_tokens,
        doc_context,
        doc_title,
        skill_context,
        enable_thinking.unwrap_or(false),
    )
    .await
}

#[tauri::command]
pub async fn ai_chat_streaming(
    content: String,
    context: Option<String>,
    settings: AISettings,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    doc_context: Option<String>,
    doc_title: Option<String>,
    skill_context: Option<String>,
    enable_thinking: Option<bool>,
    window: WebviewWindow,
) -> Result<(), String> {
    if !settings.enabled {
        return Err("AI功能未启用".to_string());
    }

    if settings.api_key.is_empty() {
        return Err("请先配置API密钥".to_string());
    }

    // chat_streaming 也用 spawn 隔离，防止 panic 传播
    let handle = tokio::task::spawn(async move {
        client::chat_streaming(
            &content,
            context.as_deref(),
            &settings,
            temperature,
            max_tokens,
            doc_context,
            doc_title,
            skill_context,
            enable_thinking.unwrap_or(false),
            window,
        )
        .await
    });

    match handle.await {
        Ok(result) => result,
        Err(join_error) => {
            let msg = if join_error.is_panic() {
                format!("[chat_streaming] task panic: {}", join_error)
            } else {
                format!("[chat_streaming] task cancelled: {}", join_error)
            };
            eprintln!("{}", msg);
            commands::log_to_file(&msg);
            Err(msg)
        }
    }
}

#[tauri::command]
pub async fn ai_streaming(
    action: String,
    content: String,
    settings: AISettings,
    window: WebviewWindow,
) -> Result<(), String> {
    if !settings.enabled {
        return Err("AI功能未启用".to_string());
    }

    if settings.api_key.is_empty() {
        return Err("请先配置API密钥".to_string());
    }

    client::streaming_request(&action, &content, &settings, window).await
}

#[tauri::command]
pub async fn fetch_ai_models(api_key: String, api_endpoint: String) -> Result<Vec<String>, String> {
    if api_key.is_empty() {
        return Err("API密钥不能为空".to_string());
    }
    if api_endpoint.is_empty() {
        return Err("API端点不能为空".to_string());
    }

    client::fetch_models(&api_key, &api_endpoint).await
}
