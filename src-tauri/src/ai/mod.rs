mod client;
mod prompts;

use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

use crate::commands::AISettings;

pub use client::AIResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofreadResult {
    pub from: usize,
    pub to: usize,
    pub original: String,
    pub suggestion: String,
    #[serde(rename = "type")]
    pub error_type: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionSuggestion {
    pub text: String,
    pub style: String,
}

#[tauri::command]
pub async fn ai_request(
    action: String,
    content: String,
    context: Option<String>,
    settings: AISettings,
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
        _ => Err(format!("未知的AI操作: {}", action)),
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
