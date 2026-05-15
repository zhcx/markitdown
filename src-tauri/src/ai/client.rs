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
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<ThinkingConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ThinkingConfig {
    #[serde(rename = "type")]
    type_: String,
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

async fn send_request(
    client: &Client,
    url: &str,
    settings: &AISettings,
    body: &serde_json::Value,
) -> Result<reqwest::Response, String> {
    let mut last_error = String::new();

    for attempt in 0..3 {
        let mut req = client.post(url).header("Content-Type", "application/json");

        if is_anthropic(settings) {
            req = req.header("x-api-key", &settings.api_key).header("anthropic-version", "2023-06-01");
        } else {
            req = req.header("Authorization", format!("Bearer {}", settings.api_key));
        }

        let send_result = req.json(body).send().await;

        match send_result {
            Ok(response) => {
                let status = response.status();
                if status.is_success() || !is_retryable_status(status) || attempt == 2 {
                    return Ok(response);
                }
                let body_text = response.text().await.unwrap_or_default();
                last_error = format!("API错误 ({}): {}", status, trim_error_body(&body_text));
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

    Err(if last_error.is_empty() {
        "API请求失败，请稍后重试".to_string()
    } else {
        last_error
    })
}

async fn call_api(
    prompt: String,
    settings: &AISettings,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
) -> Result<String, String> {
    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
        reasoning_content: None,
    }];
    call_api_with_messages(messages, settings, Some("你是一位专业的写作助手，擅长中文内容创作和编辑。"), max_tokens, temperature, false).await
}

async fn call_api_with_messages(
    messages: Vec<ChatMessage>,
    settings: &AISettings,
    system_prompt: Option<&str>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    enable_thinking: bool,
) -> Result<String, String> {
    let client = get_client()?;
    let endpoint = get_api_endpoint(settings);
    let temperature = temperature.unwrap_or(settings.temperature);

    if is_anthropic(settings) {
        return call_anthropic_with_messages(&client, &endpoint, messages, system_prompt, settings, max_tokens, temperature).await;
    }

    let url = format!("{}/chat/completions", endpoint);
    let mut full_messages = messages;
    if let Some(sp) = system_prompt {
        full_messages.insert(0, ChatMessage { role: "system".to_string(), content: sp.to_string(), reasoning_content: None });
    }

    let request = ChatRequest {
        model: settings.model.clone(),
        messages: full_messages,
        temperature,
        stream: false,
        max_tokens,
        thinking: enable_thinking.then(|| ThinkingConfig { type_: "enabled".into() }),
    };

    let body = serde_json::to_value(&request).map_err(|e| format!("序列化请求失败: {}", e))?;
    let response = send_request(&client, &url, settings, &body).await?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        return Err(format!("API错误 ({}): {}", status, trim_error_body(&body_text)));
    }

    let chat_response: ChatResponse = response.json().await.map_err(|e| format!("解析响应失败: {}", e))?;

    if chat_response.choices.is_empty() {
        return Err("API返回空响应".to_string());
    }

    let content = &chat_response.choices[0].message.content;
    if content.is_empty() {
        return Err("API返回空内容".to_string());
    }

    Ok(content.clone())
}

/// Like call_api_with_messages but also extracts reasoning_content (DeepSeek/OpenAI o1/etc.)
async fn call_chat_api(
    messages: Vec<ChatMessage>,
    settings: &AISettings,
    system_prompt: Option<&str>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
    enable_thinking: bool,
) -> Result<(String, Option<String>), String> {
    let client = get_client()?;
    let endpoint = get_api_endpoint(settings);
    let temperature = temperature.unwrap_or(settings.temperature);

    if is_anthropic(settings) {
        let text = call_anthropic_with_messages(&client, &endpoint, messages, system_prompt, settings, max_tokens, temperature).await?;
        return Ok((text, None));
    }

    let url = format!("{}/chat/completions", endpoint);
    let mut full_messages = messages;
    if let Some(sp) = system_prompt {
        full_messages.insert(0, ChatMessage { role: "system".to_string(), content: sp.to_string(), reasoning_content: None });
    }

    let request = ChatRequest {
        model: settings.model.clone(),
        messages: full_messages,
        temperature,
        stream: false,
        max_tokens,
        thinking: enable_thinking.then(|| ThinkingConfig { type_: "enabled".into() }),
    };

    let body = serde_json::to_value(&request).map_err(|e| format!("序列化请求失败: {}", e))?;
    let response = send_request(&client, &url, settings, &body).await?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        return Err(format!("API错误 ({}): {}", status, trim_error_body(&body_text)));
    }

    let chat_response: ChatResponse = response.json().await.map_err(|e| format!("解析响应失败: {}", e))?;

    if chat_response.choices.is_empty() {
        return Err("API返回空响应".to_string());
    }

    let msg = &chat_response.choices[0].message;
    let content = &msg.content;
    if content.is_empty() {
        return Err("API返回空内容".to_string());
    }

    Ok((content.clone(), msg.reasoning_content.clone().filter(|r| !r.is_empty())))
}

async fn call_anthropic_with_messages(
    client: &Client,
    endpoint: &str,
    messages: Vec<ChatMessage>,
    system_prompt: Option<&str>,
    settings: &AISettings,
    max_tokens: Option<u32>,
    temperature: f32,
) -> Result<String, String> {
    let url = format!("{}/messages", endpoint);
    let max_tokens = max_tokens.unwrap_or(1024);

    let anthropic_messages: Vec<AnthropicMessage> = messages.into_iter()
        .map(|m| AnthropicMessage { role: m.role, content: m.content })
        .collect();

    let request = AnthropicRequest {
        model: settings.model.clone(),
        messages: anthropic_messages,
        max_tokens,
        temperature,
        system: system_prompt.map(|s| s.to_string()),
    };

    let body = serde_json::to_value(&request).map_err(|e| format!("序列化请求失败: {}", e))?;
    let response = send_request(client, &url, settings, &body).await?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API错误 ({}): {}", status, trim_error_body(&body_text)));
    }

    let anthropic_response: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| format!("解析Anthropic响应失败: {}", e))?;

    if anthropic_response.content.is_empty() {
        return Err("Anthropic API返回空响应".to_string());
    }

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

pub async fn chat(
    content: &str,
    context: Option<&str>,
    settings: &AISettings,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    doc_context: Option<String>,
    doc_title: Option<String>,
    enable_thinking: bool,
) -> Result<AIResponse, String> {
    let system_prompt = get_prompt(PromptAction::Chat, "", None, settings);

    let mut messages = Vec::new();

    if let Some(ref doc_content) = doc_context {
        let title = doc_title.as_deref().unwrap_or("未命名文档");
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: format!("以下是用户当前正在编辑的文档《{}》的完整内容，请基于此文档内容回答用户的问题：\n\n{}", title, doc_content),
            reasoning_content: None,
        });
    }

    if let Some(ctx) = context {
        if let Ok(history) = serde_json::from_str::<Vec<ChatMessage>>(ctx) {
            messages.extend(history);
        }
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: content.to_string(),
        reasoning_content: None,
    });

    let result = call_chat_api(messages, settings, Some(&system_prompt), max_tokens, temperature, enable_thinking).await;

    match result {
        Ok((text, reasoning)) => Ok(AIResponse {
            success: true,
            data: serde_json::json!({ "response": text, "reasoning": reasoning }),
            message: None,
        }),
        Err(e) => Ok(AIResponse {
            success: false,
            data: serde_json::json!({}),
            message: Some(e),
        }),
    }
}

/// Builds the messages array for chat, shared between streaming and non-streaming.
fn build_chat_messages(
    content: &str,
    context: Option<&str>,
    doc_context: Option<&str>,
    doc_title: Option<&str>,
    system_prompt: &str,
) -> Vec<ChatMessage> {
    let mut messages = Vec::new();

    if let Some(doc_content) = doc_context {
        let title = doc_title.unwrap_or("未命名文档");
        messages.push(ChatMessage {
            role: "system".to_string(),
            content: format!("以下是用户当前正在编辑的文档《{}》的完整内容，请基于此文档内容回答用户的问题：\n\n{}", title, doc_content),
            reasoning_content: None,
        });
    }

    if let Some(ctx) = context {
        if let Ok(history) = serde_json::from_str::<Vec<ChatMessage>>(ctx) {
            messages.extend(history);
        }
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: content.to_string(),
        reasoning_content: None,
    });

    // Prepend system prompt as first message
    messages.insert(0, ChatMessage {
        role: "system".to_string(),
        content: system_prompt.to_string(),
        reasoning_content: None,
    });

    messages
}

pub async fn chat_streaming(
    content: &str,
    context: Option<&str>,
    settings: &AISettings,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    doc_context: Option<String>,
    doc_title: Option<String>,
    enable_thinking: bool,
    window: WebviewWindow,
) -> Result<(), String> {
    let system_prompt = get_prompt(PromptAction::Chat, "", None, settings);
    let messages = build_chat_messages(
        content,
        context,
        doc_context.as_deref(),
        doc_title.as_deref(),
        &system_prompt,
    );
    let temperature = temperature.unwrap_or(settings.temperature);

    // Anthropic: fall back to non-streaming (no reasoning_content support)
    if is_anthropic(settings) {
        return chat_streaming_anthropic_fallback(messages, settings, max_tokens, temperature, &window).await;
    }

    let client = get_client()?;
    let endpoint = get_api_endpoint(settings);
    let url = format!("{}/chat/completions", endpoint);

    let request = ChatRequest {
        model: settings.model.clone(),
        messages,
        temperature,
        stream: true,
        max_tokens,
        thinking: enable_thinking.then(|| ThinkingConfig { type_: "enabled".into() }),
    };

    let body = serde_json::to_value(&request).map_err(|e| format!("序列化请求失败: {}", e))?;

    let mut response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", settings.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        let err_msg = format!("API错误 ({}): {}", status, trim_error_body(&body_text));
        window.emit("ai-chat-error", serde_json::json!({ "message": &err_msg })).ok();
        return Err(err_msg);
    }

    let mut buffer = String::new();
    let mut reasoning_done = false;

    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|e| format!("流读取失败: {}", e))?;

        match chunk {
            Some(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                buffer.push_str(&text);

                while let Some(pos) = buffer.find("\n\n") {
                    let event_str = buffer[..pos].to_string();
                    buffer = buffer[pos + 2..].to_string();

                    for line in event_str.lines() {
                        if let Some(data) = line.strip_prefix("data: ") {
                            if data == "[DONE]" {
                                break;
                            }
                            if let Ok(chunk_data) = serde_json::from_str::<serde_json::Value>(data) {
                                if let Some(choices) = chunk_data["choices"].as_array() {
                                    if let Some(choice) = choices.first() {
                                        let delta = &choice["delta"];

                                        if let Some(rc) = delta["reasoning_content"].as_str() {
                                            if !rc.is_empty() {
                                                window.emit("ai-chat-reasoning-chunk", serde_json::json!({ "content": rc })).ok();
                                            }
                                        }

                                        if let Some(c) = delta["content"].as_str() {
                                            if !c.is_empty() {
                                                if !reasoning_done {
                                                    reasoning_done = true;
                                                    window.emit("ai-chat-reasoning-done", serde_json::json!({})).ok();
                                                }
                                                window.emit("ai-chat-content-chunk", serde_json::json!({ "content": c })).ok();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            None => break,
        }
    }

    if !reasoning_done {
        window.emit("ai-chat-reasoning-done", serde_json::json!({})).ok();
    }
    window.emit("ai-chat-done", serde_json::json!({})).ok();

    Ok(())
}

/// Non-streaming fallback for Anthropic — emits the full response as events.
async fn chat_streaming_anthropic_fallback(
    messages: Vec<ChatMessage>,
    settings: &AISettings,
    max_tokens: Option<u32>,
    temperature: f32,
    window: &WebviewWindow,
) -> Result<(), String> {
    let client = get_client()?;
    let endpoint = get_api_endpoint(settings);

    // Separate system messages from conversation messages
    let system_msgs: Vec<&str> = messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .collect();
    let system_prompt = if system_msgs.is_empty() {
        None
    } else {
        Some(system_msgs.join("\n\n"))
    };

    let conv_msgs: Vec<ChatMessage> = messages
        .into_iter()
        .filter(|m| m.role != "system")
        .collect();

    let text = call_anthropic_with_messages(
        &client,
        &endpoint,
        conv_msgs,
        system_prompt.as_deref(),
        settings,
        max_tokens,
        temperature,
    )
    .await?;

    window.emit("ai-chat-reasoning-done", serde_json::json!({})).ok();
    window.emit("ai-chat-content-chunk", serde_json::json!({ "content": &text })).ok();
    window.emit("ai-chat-done", serde_json::json!({})).ok();

    Ok(())
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
        "chat" => PromptAction::Chat,
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
                reasoning_content: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: prompt,
                reasoning_content: None,
            },
        ],
        temperature: settings.temperature,
        stream: true,
        max_tokens: None,
        thinking: None,
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
