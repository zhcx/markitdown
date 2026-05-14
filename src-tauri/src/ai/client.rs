use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{Emitter, WebviewWindow};
use tokio::time::sleep;

use crate::commands::AISettings;
use super::prompts::{get_prompt, PromptAction};

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

fn get_client() -> Result<Client, String> {
    if let Some(client) = HTTP_CLIENT.get() {
        return Ok(client.clone());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(6))
        .pool_idle_timeout(Duration::from_secs(90))
        .tcp_nodelay(true)
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let _ = HTTP_CLIENT.set(client);
    Ok(HTTP_CLIENT.get().expect("HTTP client initialized").clone())
}

fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::TOO_MANY_REQUESTS
        || status == reqwest::StatusCode::REQUEST_TIMEOUT
        || status.is_server_error()
}

fn trim_error_body(body: &str) -> String {
    const MAX_ERROR_LEN: usize = 600;
    let trimmed = body.trim();
    if trimmed.chars().count() <= MAX_ERROR_LEN {
        return trimmed.to_string();
    }

    trimmed.chars().take(MAX_ERROR_LEN).collect::<String>() + "..."
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
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    max_tokens: u32,
    temperature: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AnthropicContent {
    text: Option<String>,
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
    let endpoint = if settings.provider == "custom" && !settings.api_endpoint.is_empty() {
        settings.api_endpoint.clone()
    } else if settings.provider == "anthropic" {
        "https://api.anthropic.com/v1".to_string()
    } else if settings.provider == "deepseek" {
        "https://api.deepseek.com/v1".to_string()
    } else if settings.provider == "siliconflow" {
        "https://api.siliconflow.cn/v1".to_string()
    } else {
        "https://api.openai.com/v1".to_string()
    };

    endpoint.trim_end_matches('/').to_string()
}

fn is_anthropic(settings: &AISettings) -> bool {
    settings.provider == "anthropic"
}

async fn call_api(
    prompt: String,
    settings: &AISettings,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
) -> Result<String, String> {
    let client = get_client()?;
    let endpoint = get_api_endpoint(settings);
    let temperature = temperature.unwrap_or(settings.temperature);

    // 检测是否为 Anthropic API，需要特殊处理
    if is_anthropic(settings) {
        return call_anthropic_api(&client, &endpoint, &prompt, settings, max_tokens, temperature).await;
    }

    // OpenAI/DeepSeek/Custom 兼容的处理方式
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
        temperature,
        stream: false,
        max_tokens,
    };

    let mut last_error = String::new();
    let response = {
        let mut final_response = None;

        for attempt in 0..3 {
            let send_result = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", settings.api_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await;

            match send_result {
                Ok(response) => {
                    let status = response.status();
                    if response.status().is_success() || !is_retryable_status(status) || attempt == 2 {
                        final_response = Some(response);
                        break;
                    }

                    let body = response.text().await.unwrap_or_default();
                    last_error = format!("API错误 ({}): {}", status, trim_error_body(&body));
                }
                Err(error) => {
                    last_error = format!("API请求失败: {}", error);
                    if attempt == 2 {
                        return Err(last_error);
                    }
                }
            }

            sleep(Duration::from_millis(350 * (attempt + 1) as u64)).await;
        }

        final_response.ok_or_else(|| {
            if last_error.is_empty() {
                "API请求失败，请稍后重试".to_string()
            } else {
                last_error
            }
        })?
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API错误 ({}): {}", status, trim_error_body(&body)));
    }

    let chat_response: ChatResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if chat_response.choices.is_empty() {
        return Err("API返回空响应".to_string());
    }

    let content = &chat_response.choices[0].message.content;

    if content.is_empty() {
        return Err("API返回空内容".to_string());
    }

    Ok(content.clone())
}

async fn call_anthropic_api(
    client: &Client,
    endpoint: &str,
    prompt: &str,
    settings: &AISettings,
    max_tokens: Option<u32>,
    temperature: f32,
) -> Result<String, String> {
    let url = format!("{}/messages", endpoint);
    let max_tokens = max_tokens.unwrap_or(1024);

    // 将 prompt 分割成 system 和 user 部分
    // prompt 格式是: "你是一位专业的写作助手...请根据..."
    // 我们把第一行作为 system message，之后的作为 user message
    let lines: Vec<&str> = prompt.lines().collect();
    let (system_msg, user_msg) = if lines.len() > 1 {
        (lines[0].to_string(), lines[1..].join("\n"))
    } else {
        ("你是一位专业的写作助手，擅长中文内容创作和编辑。".to_string(), prompt.to_string())
    };

    let request = AnthropicRequest {
        model: settings.model.clone(),
        messages: vec![
            AnthropicMessage {
                role: "user".to_string(),
                content: user_msg,
            },
        ],
        max_tokens,
        temperature,
        system: Some(system_msg),
    };

    let mut last_error = String::new();
    let response = {
        let mut final_response = None;

        for attempt in 0..3 {
            let send_result = client
                .post(&url)
                .header("x-api-key", &settings.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await;

            match send_result {
                Ok(response) => {
                    let status = response.status();
                    if response.status().is_success() || !is_retryable_status(status) || attempt == 2 {
                        final_response = Some(response);
                        break;
                    }

                    let body = response.text().await.unwrap_or_default();
                    last_error = format!("Anthropic API错误 ({}): {}", status, trim_error_body(&body));
                }
                Err(error) => {
                    last_error = format!("Anthropic API请求失败: {}", error);
                    if attempt == 2 {
                        return Err(last_error);
                    }
                }
            }

            sleep(Duration::from_millis(350 * (attempt + 1) as u64)).await;
        }

        final_response.ok_or_else(|| {
            if last_error.is_empty() {
                "Anthropic API请求失败，请稍后重试".to_string()
            } else {
                last_error
            }
        })?
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API错误 ({}): {}", status, trim_error_body(&body)));
    }

    let anthropic_response: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| format!("解析Anthropic响应失败: {}", e))?;

    if anthropic_response.content.is_empty() {
        return Err("Anthropic API返回空响应".to_string());
    }

    // 提取第一个 content block 中的 text
    for content in anthropic_response.content {
        if let Some(text) = content.text {
            if !text.is_empty() {
                return Ok(text);
            }
        }
    }

    Err("Anthropic API未返回有效文本".to_string())
}

pub async fn proofread(content: &str, settings: &AISettings) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Proofread, content, None, settings);
    let max_tokens = Some(((content.chars().count() / 8) as u32).clamp(800, 3000));
    let result = call_api(prompt, settings, max_tokens, Some(0.1)).await?;

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
        // Find the matching closing bracket - only count top-level brackets
        let mut depth = 0;
        let mut in_string = false;
        let mut escape_next = false;

        for (i, c) in text.char_indices() {
            if escape_next {
                escape_next = false;
                continue;
            }
            match c {
                '\\' if in_string => escape_next = true,
                '"' => in_string = !in_string,
                '[' if !in_string => depth += 1,
                ']' if !in_string => {
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

    // Try to extract from markdown code block - try multiple patterns
    let patterns = ["```json", "```JSON", "```"];
    let mut cleaned = text.to_string();
    let mut found_code_block = false;
    for pattern in patterns {
        if cleaned.contains(pattern) {
            found_code_block = true;
            // Extract content between code blocks more carefully
            if let Some(start_idx) = cleaned.find(pattern) {
                let after_start = &cleaned[start_idx + pattern.len()..];
                if let Some(end_idx) = after_start.find("```") {
                    cleaned = after_start[..end_idx].to_string();
                    break;
                }
            }
        }
    }
    if found_code_block {
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
    let result = call_api(prompt, settings, Some(800), None).await?;

    let suggestions = parse_companion_suggestions(&result);

    Ok(AIResponse {
        success: true,
        data: serde_json::json!({ "suggestions": suggestions }),
        message: None,
    })
}

fn parse_companion_suggestions(result: &str) -> Vec<String> {
    let result = result.trim();
    if result.is_empty() {
        return Vec::new();
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(result) {
        let suggestions = collect_suggestion_strings(&value);
        if !suggestions.is_empty() {
            return suggestions;
        }
    }

    let cleaned = extract_json_array(result)
        .replace(",]", "]")
        .replace(",}", "}");

    if cleaned != "[]" {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&cleaned) {
            let suggestions = collect_suggestion_strings(&value);
            if !suggestions.is_empty() {
                return suggestions;
            }
        }
    }

    let suggestions: Vec<String> = result
        .lines()
        .filter_map(clean_companion_line)
        .filter(|line| {
            !line.is_empty()
                && line != "[]"
                && line != "["
                && line != "]"
                && !line.starts_with("```")
        })
        .take(5)
        .collect();

    if !suggestions.is_empty() {
        suggestions
    } else {
        vec![result.to_string()]
    }
}

fn collect_suggestion_strings(value: &serde_json::Value) -> Vec<String> {
    let mut suggestions = Vec::new();
    collect_suggestion_strings_inner(value, &mut suggestions);
    suggestions
        .into_iter()
        .filter(|text| !text.trim().is_empty() && text.trim() != "[]")
        .map(|text| text.trim().to_string())
        .take(5)
        .collect()
}

fn collect_suggestion_strings_inner(value: &serde_json::Value, suggestions: &mut Vec<String>) {
    match value {
        serde_json::Value::String(text) => suggestions.push(text.clone()),
        serde_json::Value::Array(items) => {
            for item in items {
                collect_suggestion_strings_inner(item, suggestions);
            }
        }
        serde_json::Value::Object(map) => {
            for key in ["suggestions", "data", "items", "results", "text", "content"] {
                if let Some(value) = map.get(key) {
                    collect_suggestion_strings_inner(value, suggestions);
                }
            }
        }
        _ => {}
    }
}

fn clean_companion_line(line: &str) -> Option<String> {
    let line = line
        .trim()
        .trim_matches(',')
        .trim_matches('"')
        .trim_start_matches(|c: char| {
            c.is_ascii_digit()
                || matches!(c, '.' | ')' | '-' | '*' | '、' | ' ' | '\t')
        })
        .trim()
        .to_string();

    if line.is_empty()
        || line == "["
        || line == "]"
        || line == "[]"
        || line.starts_with("```")
        || line.starts_with('{')
        || line.starts_with('}')
    {
        None
    } else {
        Some(line)
    }
}
pub async fn rewrite(content: &str, settings: &AISettings) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Rewrite, content, None, settings);
    let max_tokens = Some(((content.chars().count() / 2) as u32).clamp(400, 1800));
    let result = call_api(prompt, settings, max_tokens, None).await?;

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
    let max_tokens = Some(((content.chars().count() / 2) as u32).clamp(400, 1800));
    let result = call_api(prompt, settings, max_tokens, Some(0.2)).await?;

    Ok(AIResponse {
        success: true,
        data: serde_json::json!({ "translated": result }),
        message: None,
    })
}

pub async fn summarize(content: &str, settings: &AISettings) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Summarize, content, None, settings);
    let result = call_api(prompt, settings, Some(500), Some(0.2)).await?;

    Ok(AIResponse {
        success: true,
        data: serde_json::json!({ "summary": result }),
        message: None,
    })
}

pub async fn outline(content: &str, settings: &AISettings) -> Result<AIResponse, String> {
    let prompt = get_prompt(PromptAction::Outline, content, None, settings);
    let result = call_api(prompt, settings, Some(900), Some(0.3)).await?;

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
    let client = get_client()?;
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
        max_tokens: None,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModelListResponse {
    data: Vec<ModelInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModelInfo {
    id: String,
}

pub async fn fetch_models(api_key: &str, api_endpoint: &str) -> Result<Vec<String>, String> {
    let client = get_client()?;
    let base_url = api_endpoint.trim_end_matches('/').to_string();
    let url = format!("{}/models", base_url);

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("请求模型列表失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("获取模型列表失败 ({}): {}", status, trim_error_body(&body)));
    }

    let list: ModelListResponse = response
        .json()
        .await
        .map_err(|e| format!("解析模型列表失败: {}", e))?;

    let models: Vec<String> = list.data.into_iter().map(|m| m.id).collect();
    if models.is_empty() {
        return Err("服务商未返回任何模型".to_string());
    }

    Ok(models)
}
