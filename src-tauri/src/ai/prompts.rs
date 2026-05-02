use crate::commands::AISettings;

#[derive(Debug, Clone, Copy)]
pub enum PromptAction {
    Proofread,
    Companion,
    Rewrite,
    Translate,
    Summarize,
    Outline,
}

fn get_style_prompt(style: &str) -> &'static str {
    match style {
        "formal" => "请以正式、专业的风格",
        "casual" => "请以轻松、活泼的风格",
        "academic" => "请以学术论文的风格",
        "creative" => "请以富有创意和想象力的风格",
        _ => "请以自然流畅的风格",
    }
}

pub fn get_prompt(
    action: PromptAction,
    content: &str,
    context: Option<&str>,
    settings: &AISettings,
) -> String {
    match action {
        PromptAction::Proofread => {
            format!(
                r#"检查以下Markdown文本中的错误（错别字、语法、标点、用词、Markdown语法错误、排版问题）。

严格要求：只返回JSON数组，不要任何其他文字、说明或代码块标记。

返回格式（无问题返回[]）：
[{{"from":起始位置,"to":结束位置,"original":"原文","suggestion":"建议","type":"spelling|grammar|punctuation|style|markdown|layout","explanation":"说明"}}]

type类型：spelling(错字)、grammar(语法)、punctuation(标点)、style(风格)、markdown(MD语法)、layout(排版)
from和to是字符位置索引（从0开始）。

文本：
{}"#,
                content
            )
        }
        PromptAction::Companion => {
            let style = get_style_prompt(&settings.writing_style);
            let context_info = context
                .map(|c| format!("\n\n前文上下文：\n{}", c))
                .unwrap_or_default();
            format!(
                r#"{}续写以下内容。请直接输出续写的文字，不要添加任何解释或说明。
{}
内容：{}"#,
                style, context_info, content
            )
        }
        PromptAction::Rewrite => {
            let style = get_style_prompt(&settings.writing_style);
            format!(
                r#"{}重写以下内容，保持原意但使用更好的表达方式。请直接输出重写后的文字。

内容：{}"#,
                style, content
            )
        }
        PromptAction::Translate => {
            let target_lang = context.unwrap_or("英文");
            format!(
                r#"请将以下内容翻译成{}。如果是中文内容则翻译成英文，如果是英文内容则翻译成中文。
请直接输出翻译结果，不要添加任何解释。

内容：{}"#,
                target_lang, content
            )
        }
        PromptAction::Summarize => {
            format!(
                r#"请为以下内容生成一个简洁的摘要，突出主要观点。摘要长度控制在100字以内。

内容：{}"#,
                content
            )
        }
        PromptAction::Outline => {
            format!(
                r#"请根据以下标题和内容，生成一个详细的写作大纲。使用Markdown格式输出。

内容：{}"#,
                content
            )
        }
    }
}

impl PromptAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            PromptAction::Proofread => "proofread",
            PromptAction::Companion => "companion",
            PromptAction::Rewrite => "rewrite",
            PromptAction::Translate => "translate",
            PromptAction::Summarize => "summarize",
            PromptAction::Outline => "outline",
        }
    }
}
