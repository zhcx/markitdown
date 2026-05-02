use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{Emitter, WebviewWindow};

use crate::commands::AISettings;
use super::prompts::{get_prompt, PromptAction};

fn create_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIResponse {
    pub success: bool,
    pub data: serde_json::Value,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Choice {
    message: ChatMessage,
}

fn get_api_endpoint(settings: &AISettings) -> String {
    if settings.provider == "custom" && !settings.api_endpoint.is_empty() {
        settings.api_endpoint.clone()
    } else if settings.provider == "anthropic" {
        "https://api.anthropic.com/v1".to_string()
    } else if settings.provider == "deepseek" {
        "https://api.deepseek.com/v1".to_string()
    } else {
        "https://api.openai.com/v1".to_string()
    }
}

async fn call_api(prompt: String, settings: &AISettings) -> Result<String, String> {
    let client = create_client()?;
    let endpoint = get_api_endpoint(settings);
    let url = format!("{}/chat/completions", endpoint);

    let request = ChatRequest {
        model: settings.model.clone(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: "你是一位专业的写作助手，擅长中文内容创作和编辑。".to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: prompt,
            },
        ],
        temperature: settings.temperature,
        stream: false,
    };

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", settings.api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("API请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API错误 ({}): {}", status, body));
    }

    let chat_response: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if chat_response.choices.is_empty() {
        return Err("API返回空响应".to_string());
    }

    Ok(chat_response.choices[0].message.content.clone())
}

pub async fn proofread(content: &str, settings: &AISettings) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Proofread, content, None, settings);
    let result = call_api(prompt, settings).await?;

    // Extract JSON from response (handle markdown code blocks and extra text)
    let json_str = extract_json_array(&result);

    // Clean up the response - remove trailing commas before ] or }
    let cleaned = json_str
        .replace(",]", "]")
        .replace(",}", "}");

    // Parse JSON result
    let data: serde_json::Value = serde_json::from_str(&cleaned)
        .map_err(|e| format!("解析校对结果失败: {}. 原始响应: {}", e, result))?;

    Ok(AIResponse {
        success: true,
        data,
        message: None,
    })
}

fn extract_json_array(text: &str) -> String {
    // Try to find JSON array in the response
    let text = text.trim();

    // If it starts with [, try to find the matching ]
    if text.starts_with('[') {
        // Find the matching closing bracket
        let mut depth = 0;
        for (i, c) in text.char_indices() {
            match c {
                '[' => depth += 1,
                ']' => {
                    depth -= 1;
                    if depth == 0 {
                        return text[..=i].to_string();
                    }
                }
                _ => {}
            }
        }
        return text.to_string();
    }

    // Try to extract from markdown code block
    if text.contains("```json") || text.contains("```") {
        // Remove markdown code blocks
        let cleaned = text
            .replace("```json", "")
            .replace("```JSON", "")
            .replace("```", "");
        return extract_json_array(&cleaned);
    }

    // Try to find [ anywhere in the text
    if let Some(start) = text.find('[') {
        let remaining = &text[start..];
        return extract_json_array(remaining);
    }

    // Return empty array if no JSON found
    "[]".to_string()
}

pub async fn companion(
    content: &str,
    context: Option<&str>,
    settings: &AISettings,
) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Companion, content, context, settings);
    let result = call_api(prompt, settings).await?;

    Ok(AIResponse {
        success: true,
        data: serde_json::json!({ "suggestions": [result] }),
        message: None,
    })
}

pub async fn rewrite(content: &str, settings: &AISettings) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Rewrite, content, None, settings);
    let result = call_api(prompt, settings).await?;

    Ok(AIResponse {
        success: true,
        data: serde_json::json!({ "rewritten": result }),
        message: None,
    })
}

pub async fn translate(
    content: &str,
    target_lang: Option<&str>,
    settings: &AISettings,
) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Translate, content, target_lang, settings);
    let result = call_api(prompt, settings).await?;

    Ok(AIResponse {
        success: true,
        data: serde_json::json!({ "translated": result }),
        message: None,
    })
}

pub async fn summarize(content: &str, settings: &AISettings) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Summarize, content, None, settings);
    let result = call_api(prompt, settings).await?;

    Ok(AIResponse {
        success: true,
        data: serde_json::json!({ "summary": result }),
        message: None,
    })
}

pub async fn outline(content: &str, settings: &AISettings) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Outline, content, None, settings);
    let result = call_api(prompt, settings).await?;

    Ok(AIResponse {
        success: true,
        data: serde_json::json!({ "outline": result }),
        message: None,
    })
}

pub async fn streaming_request(
    action: &str,
    content: &str,
    settings: &AISettings,
    window: WebviewWindow,
) -> Result<(), String> {
    let prompt_action = match action {
        "proofread" => PromptAction::Proofread,
        "companion" => PromptAction::Companion,
        "rewrite" => PromptAction::Rewrite,
        "translate" => PromptAction::Translate,
        "summarize" => PromptAction::Summarize,
        "outline" => PromptAction::Outline,
        _ => return Err(format!("未知的AI操作: {}", action)),
    };

    let prompt = get_prompt(prompt_action, content, None, settings);
    let client = create_client()?;
    let endpoint = get_api_endpoint(settings);
    let url = format!("{}/chat/completions", endpoint);

    let request = ChatRequest {
        model: settings.model.clone(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: "你是一位专业的写作助手，擅长中文内容创作和编辑。".to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: prompt,
            },
        ],
        temperature: settings.temperature,
        stream: true,
    };

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", settings.api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("API请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("API错误: {}", status));
    }

    // For simplicity, collect all chunks and emit final result
    // In production, this would process SSE stream properly
    let full_text = response.text().await.map_err(|e| format!("读取响应失败: {}", e))?;

    window
        .emit("ai-stream-complete", &full_text)
        .map_err(|e| format!("发送事件失败: {}", e))?;

    Ok(())
}