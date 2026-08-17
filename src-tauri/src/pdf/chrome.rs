use headless_chrome::types::PrintToPdfOptions;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Emitter, WebviewWindow};

use crate::imaging::{embed_images, file_url_from_path};
use super::browser_pool;
use super::engine::PdfInput;
use super::error::{PdfError, PdfResult};
use super::fonts::FontConfig;
use super::PdfExportOptions;

/// 进度事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub stage: String,
    pub progress: u8,
    pub message: String,
}

/// Chrome headless PDF 引擎
pub struct ChromeEngine {
    font_config: FontConfig,
}

impl ChromeEngine {
    pub fn new() -> Self {
        Self {
            font_config: FontConfig::detect(),
        }
    }
}

impl Default for ChromeEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl ChromeEngine {
    /// 带进度反馈的 PDF 生成
    pub fn generate_with_progress(
        &self,
        input: PdfInput,
        options: &PdfExportOptions,
        window: &WebviewWindow,
    ) -> PdfResult<Vec<u8>> {
        let html_with_images = embed_images(&input.html_body, input.file_path.as_deref());
        let full_html =
            wrap_html_with_fonts(&html_with_images, options.margin_mm, &self.font_config);
        generate_pdf_via_chrome(&full_html, options, Some(window))
    }
}

/// 将本地图片转换为 base64 data URL 的实现见 crate::imaging（与
/// HTML/Word 导出共享，避免两份实现漂移）。

pub fn wrap_html_with_fonts(body: &str, margin_mm: f32, font_config: &FontConfig) -> String {
    let font_family_css = font_config.generate_font_family_css();

    format!(
        r##"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'">
<title>Zeditor Export</title><style>
@page {{ margin: {margin}mm; }}
* {{ box-sizing: border-box; }}
body {{
    {font_family}
    font-size: 16px;
    line-height: 1.6;
    color: #333;
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
}}
h1, h2, h3, h4, h5, h6 {{ margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }}
h1 {{ font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }}
h2 {{ font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }}
h3 {{ font-size: 1.25em; }}
p {{ margin-top: 0; margin-bottom: 16px; }}
code {{ background-color: rgba(27,31,35,0.05); border-radius: 3px; font-family: "SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace; font-size: 85%; padding: 0.2em 0.4em; }}
pre {{ background-color: #f6f8fa; border-radius: 6px; font-size: 85%; line-height: 1.45; overflow: auto; padding: 16px; white-space: pre-wrap; word-wrap: break-word; }}
pre code {{ background-color: transparent; border: 0; padding: 0; }}
blockquote {{ border-left: 0.25em solid #dfe2e5; color: #6a737d; margin: 0 0 16px 0; padding: 0 1em; }}
table {{ border-collapse: collapse; width: 100%; margin-bottom: 16px; }}
table th, table td {{ border: 1px solid #dfe2e5; padding: 6px 13px; }}
table tr:nth-child(2n) {{ background-color: #f6f8fa; }}
img {{ max-width: 100%; height: auto; }}
ul, ol {{ padding-left: 2em; margin-bottom: 16px; }}
a {{ color: #0366d6; text-decoration: none; word-wrap: break-word; overflow-wrap: break-word; word-break: break-all; }}
a:hover {{ text-decoration: underline; }}
</style>
</head>
<body>
{body}
</body>
</html>"##,
        margin = margin_mm,
        font_family = font_family_css,
        body = body
    )
}

/// 发送进度事件
fn emit_progress(window: Option<&WebviewWindow>, stage: &str, progress: u8, message: &str) {
    if let Some(w) = window {
        let event = ProgressEvent {
            stage: stage.to_string(),
            progress,
            message: message.to_string(),
        };
        w.emit("pdf-export-progress", &event).ok();
    }
}

/// RAII 守卫：确保错误路径（navigate/evaluate/print 提前返回）也会关闭
/// 标签页，避免异常导出后浏览器 tab 泄漏累积。
struct TabGuard<'a> {
    tab: &'a headless_chrome::Tab,
    released: std::cell::Cell<bool>,
}

impl<'a> TabGuard<'a> {
    fn new(tab: &'a headless_chrome::Tab) -> Self {
        Self {
            tab,
            released: std::cell::Cell::new(false),
        }
    }

    /// 成功路径显式关闭标签页后调用，避免二次 close。
    fn release(&self) {
        self.released.set(true);
    }
}

impl Drop for TabGuard<'_> {
    fn drop(&mut self) {
        if !self.released.get() {
            self.tab.close(false).ok();
        }
    }
}

fn generate_pdf_via_chrome(
    html: &str,
    options: &PdfExportOptions,
    window: Option<&WebviewWindow>,
) -> PdfResult<Vec<u8>> {
    // 进度: 初始化
    emit_progress(window, "init", 10, "初始化浏览器...");

    // 使用浏览器池获取复用的浏览器实例；new_tab 失败通常意味着池化的
    // Chrome 已崩溃，此时丢弃实例并重启一次。
    let browser = browser_pool::get_browser()?;
    let tab = match browser.new_tab() {
        Ok(tab) => tab,
        Err(first_error) => {
            browser_pool::invalidate_browser();
            let browser = browser_pool::get_browser().map_err(|e| {
                PdfError::ChromeInit(format!("browser restart failed after: {first_error}; {e}"))
            })?;
            browser
                .new_tab()
                .map_err(|e| PdfError::ChromeInit(e.to_string()))?
        }
    };
    let _guard = TabGuard::new(tab.as_ref());

    // 进度: 加载内容
    emit_progress(window, "load", 30, "加载内容...");

    let temp_html = TempHtmlFile::new(html)?;
    let file_url = temp_html.file_url();
    tab.navigate_to(&file_url)
        .map_err(|e| PdfError::Navigation(e.to_string()))?;

    tab.wait_until_navigated()
        .map_err(|e| PdfError::Navigation(e.to_string()))?;

    // 智能等待：轮询文档就绪状态（最多 10 秒）。此前只检查一次并固定
    // 睡眠 100ms，JS 延迟渲染的内容（图表等）可能缺失。
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let ready = tab
            .evaluate("document.readyState === 'complete'", false)
            .ok()
            .and_then(|result| result.value)
            .is_some_and(|value| value.as_bool().unwrap_or(false));
        if ready || std::time::Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    // 进度: 渲染
    emit_progress(window, "render", 60, "渲染页面...");

    let pdf_options = PrintToPdfOptions {
        landscape: Some(matches!(
            options.orientation,
            super::PageOrientation::Landscape
        )),
        display_header_footer: Some(options.include_header_footer),
        print_background: Some(true),
        scale: Some(1.0),
        paper_width: Some(options.paper_width()),
        paper_height: Some(options.paper_height()),
        margin_top: Some(options.margin_mm as f64 / 25.4),
        margin_bottom: Some(options.margin_mm as f64 / 25.4),
        margin_left: Some(options.margin_mm as f64 / 25.4),
        margin_right: Some(options.margin_mm as f64 / 25.4),
        ..Default::default()
    };

    // 进度: 生成 PDF
    emit_progress(window, "generate", 80, "生成 PDF 文件...");

    let pdf_data = tab
        .print_to_pdf(Some(pdf_options))
        .map_err(|e| PdfError::Generation(e.to_string()))?;

    // 关闭标签页以释放资源
    tab.close(false).ok();
    _guard.release();

    // 进度: 完成
    emit_progress(window, "complete", 100, "导出完成");

    Ok(pdf_data)
}

struct TempHtmlFile {
    path: PathBuf,
}

impl TempHtmlFile {
    fn new(html: &str) -> PdfResult<Self> {
        let path =
            std::env::temp_dir().join(format!("zeditor_export_{}.html", uuid::Uuid::new_v4()));
        std::fs::write(&path, html.as_bytes())?;
        Ok(Self { path })
    }

    fn file_url(&self) -> String {
        file_url_from_path(&self.path)
    }
}

impl Drop for TempHtmlFile {
    fn drop(&mut self) {
        std::fs::remove_file(&self.path).ok();
    }
}
