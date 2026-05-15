use crate::commands::AISettings;

#[derive(Debug, Clone, Copy)]
pub enum PromptAction {
    Proofread,
    Companion,
    Rewrite,
    Translate,
    Summarize,
    Outline,
    Chat,
}

fn get_style_prompt(settings: &AISettings) -> String {
    if settings.writing_style == "custom" && !settings.custom_style_prompt.trim().is_empty() {
        return settings.custom_style_prompt.trim().to_string();
    }

    match settings.writing_style.as_str() {
        "formal" => "请使用正式、专业、清晰的表达风格".to_string(),
        "casual" => "请使用轻松、自然、有亲和力的表达风格".to_string(),
        "academic" => "请使用严谨、准确、偏学术的表达风格".to_string(),
        "creative" => "请使用富有创意、节奏更鲜明的表达风格".to_string(),
        _ => "请使用自然、流畅、易读的表达风格".to_string(),
    }
}

pub fn get_prompt(
    action: PromptAction,
    content: &str,
    context: Option<&str>,
    settings: &AISettings,
) -> String {
    match action {
        PromptAction::Proofread => format!(
            r#"请校对下面的 Markdown 文本，只检查真实问题，避免把作者风格当成错误。

要求：
1. 只返回 JSON 数组，不要返回解释、Markdown 代码块或额外文字。
2. 无问题时返回 []。
3. from/to 必须是原文中的 JavaScript 字符串索引（UTF-16 code unit），from 从 0 开始，to 为结束位置。
4. type 只能是 spelling、grammar、punctuation、style、markdown、layout 之一。
5. suggestion 只给可直接替换 original 的文本。

返回格式：
[{{"from":0,"to":2,"original":"原文","suggestion":"建议","type":"spelling","explanation":"简短说明"}}]

文本：
{}"#,
            content
        ),
        PromptAction::Companion => {
            let style = get_style_prompt(settings);
            let context_info = context
                .filter(|c| !c.trim().is_empty())
                .map(|c| format!("\n\n前文上下文：\n{}", c))
                .unwrap_or_default();

            format!(
                r#"{}。请根据下面内容给出 3 条可直接接在光标后的续写建议。

要求：
1. 每条建议 1-3 句话，延续原文语气，不重复原文。
2. 只输出 JSON 数组格式的字符串，例如：["建议 1", "建议 2", "建议 3"]
3. 数组元素必须是字符串。
4. 无论上下文长短，都必须返回至少 1 条续写建议。

格式示例：["续写建议一", "续写建议二", "续写建议三"]{}

内容：
{}"#,
                style, context_info, content
            )
        }
        PromptAction::Rewrite => {
            let style = get_style_prompt(settings);
            format!(
                r#"{}。请重写下面的内容，保持原意，提升表达质量。直接输出重写后的文本。

内容：
{}"#,
                style, content
            )
        }
        PromptAction::Translate => {
            let target_lang = context.unwrap_or("英文");
            format!(
                r#"请将下面内容翻译成{}。如果原文已经是英文且目标为英文，请翻译成中文。保留 Markdown 结构，直接输出译文。

内容：
{}"#,
                target_lang, content
            )
        }
        PromptAction::Summarize => format!(
            r#"请为下面内容生成 100 字以内的中文摘要，突出主要观点，直接输出摘要。

内容：
{}"#,
            content
        ),
        PromptAction::Outline => format!(
            r#"请根据下面内容生成一个清晰、可执行的写作大纲，使用 Markdown 列表输出。

内容：
{}"#,
            content
        ),
        PromptAction::Chat => {
            let style = get_style_prompt(settings);
            format!(
                r#"{}。你是一个有用的 AI 助手，帮助用户进行写作、编辑和讨论 Markdown 文档。
请根据对话历史自然地回复用户的最新消息。
直接输出你的回复，不要添加额外的前缀或格式标记。"#,
                style
            )
        }
    }
}
