mod client;
mod prompts;

use tauri::WebviewWindow;

use crate::commands::AISettings;

pub use client::AIResponse;

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
    enable_thinking: Option<bool>,
) -> Result<AIResponse, String> {
    if !settings.enabled {
        return Err("AI功能未启用".to_string());
    }

    if settings.api_key.is_empty() {
        return Err("请先配置API密钥".to_string());
    }

    match action.as_str() {
        "proofread" => client::proofread(&content, &settings).await,
        "companion" => client::companion(&content, context.as_deref(), &settings).await,
        "rewrite" => client::rewrite(&content, &settings).await,
        "translate" => client::translate(&content, context.as_deref(), &settings).await,
        "summarize" => client::summarize(&content, &settings).await,
        "outline" => client::outline(&content, &settings).await,
        "chat" => client::chat(&content, context.as_deref(), &settings, temperature, max_tokens, doc_context, doc_title, enable_thinking.unwrap_or(false)).await,
        _ => Err(format!("未知的AI操作: {}", action)),
    }
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
    enable_thinking: Option<bool>,
    window: WebviewWindow,
) -> Result<(), String> {
    if !settings.enabled {
        return Err("AI功能未启用".to_string());
    }

    if settings.api_key.is_empty() {
        return Err("请先配置API密钥".to_string());
    }

    client::chat_streaming(
        &content,
        context.as_deref(),
        &settings,
        temperature,
        max_tokens,
        doc_context,
        doc_title,
        enable_thinking.unwrap_or(false),
        window,
    )
    .await
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
