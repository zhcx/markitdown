use base64::Engine;
use headless_chrome::types::PrintToPdfOptions;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{Emitter, WebviewWindow};

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

/// 将本地图片转换为 base64 data URL
fn embed_images(html: &str, md_file_path: Option<&str>) -> String {
    let mut result = String::with_capacity(html.len());
    let mut rest = html;
    let base_dir = md_file_path
        .and_then(|md| Path::new(md).parent())
        .map(Path::to_path_buf);
    let mut image_cache: HashMap<PathBuf, Option<String>> = HashMap::new();

    loop {
        let tag_start = match rest.find("<img") {
            Some(i) => i,
            None => {
                result.push_str(rest);
                break;
            }
        };
        result.push_str(&rest[..tag_start]);
        let after_tag = &rest[tag_start..];

        let tag_end = match after_tag.find('>') {
            Some(i) => i + 1,
            None => {
                result.push_str(after_tag);
                break;
            }
        };
        let tag = &after_tag[..tag_end];

        if let Some((src_key, src_end)) = find_img_src_range(tag) {
            let src_val = &tag[src_key..src_end];
            if let Some(data_url) =
                resolve_image_src(base_dir.as_deref(), src_val, &mut image_cache)
            {
                result.push_str(&tag[..src_key]);
                result.push_str(&data_url);
                result.push_str(&tag[src_end..]);
            } else {
                result.push_str(tag);
            }
        } else {
            result.push_str(tag);
        }

        rest = &after_tag[tag_end..];
    }
    result
}

fn find_img_src_range(tag: &str) -> Option<(usize, usize)> {
    for quote in ['"', '\''] {
        let pattern = if quote == '"' { "src=\"" } else { "src='" };
        if let Some(start) = tag.find(pattern) {
            let value_start = start + pattern.len();
            let value_end = tag[value_start..]
                .find(quote)
                .map(|index| value_start + index)?;
            return Some((value_start, value_end));
        }
    }
    None
}

fn resolve_image_src(
    base_dir: Option<&Path>,
    src: &str,
    image_cache: &mut HashMap<PathBuf, Option<String>>,
) -> Option<String> {
    if src.starts_with("http://") || src.starts_with("https://") || src.starts_with("data:") {
        return None;
    }

    let p = std::path::Path::new(src);
    let resolved = if p.is_absolute() {
        p.to_path_buf()
    } else if let Some(base_dir) = base_dir {
        base_dir.join(p)
    } else {
        return None;
    };
    let cache_key = std::fs::canonicalize(&resolved).unwrap_or(resolved);

    if let Some(cached) = image_cache.get(&cache_key) {
        return cached.clone();
    }

    if !cache_key.exists() {
        image_cache.insert(cache_key, None);
        return None;
    }

    let data = match std::fs::read(&cache_key) {
        Ok(data) => data,
        Err(_) => {
            image_cache.insert(cache_key, None);
            return None;
        }
    };
    let mime = guess_mime(&cache_key);
    let data_url = format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(&data)
    );
    image_cache.insert(cache_key, Some(data_url.clone()));
    Some(data_url)
}

fn guess_mime(p: &Path) -> &'static str {
    match p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/png",
    }
}

pub fn wrap_html_with_fonts(body: &str, margin_mm: f32, font_config: &FontConfig) -> String {
    let font_family_css = font_config.generate_font_family_css();

    format!(
        r##"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MarkitDown Export</title>
<style>
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

fn generate_pdf_via_chrome(
    html: &str,
    options: &PdfExportOptions,
    window: Option<&WebviewWindow>,
) -> PdfResult<Vec<u8>> {
    // 进度: 初始化
    emit_progress(window, "init", 10, "初始化浏览器...");

    // 使用浏览器池获取复用的浏览器实例
    let browser = browser_pool::get_browser()?;

    // 进度: 加载内容
    emit_progress(window, "load", 30, "加载内容...");

    let tab = browser
        .new_tab()
        .map_err(|e| PdfError::ChromeInit(e.to_string()))?;

    let temp_html = TempHtmlFile::new(html)?;
    let file_url = temp_html.file_url();
    tab.navigate_to(&file_url)
        .map_err(|e| PdfError::Navigation(e.to_string()))?;

    tab.wait_until_navigated()
        .map_err(|e| PdfError::Navigation(e.to_string()))?;

    // 智能等待：检查文档就绪状态
    let ready = tab
        .evaluate("document.readyState === 'complete'", false)
        .map_err(|e| PdfError::Navigation(e.to_string()))?;

    // 如果文档未就绪，短暂等待
    if let Some(obj) = ready.value {
        if obj.as_bool().unwrap_or(false) {
            // 文档已就绪
        } else {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
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
            std::env::temp_dir().join(format!("markitdown_export_{}.html", uuid::Uuid::new_v4()));
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

fn file_url_from_path(path: &Path) -> String {
    let mut path = path.to_string_lossy().replace('\\', "/");
    if !path.starts_with('/') {
        path = format!("/{path}");
    }
    format!("file://{}", encode_file_url_path(&path))
}

fn encode_file_url_path(path: &str) -> String {
    let mut encoded = String::with_capacity(path.len());
    for byte in path.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b':' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_url_from_path_encodes_spaces_and_unicode() {
        let url = file_url_from_path(Path::new(r"C:\Temp Dir\中文.html"));

        assert_eq!(url, "file:///C:/Temp%20Dir/%E4%B8%AD%E6%96%87.html");
    }

    #[test]
    fn embed_images_continues_after_img_without_src() {
        let temp_dir =
            std::env::temp_dir().join(format!("markitdown_pdf_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let image_path = temp_dir.join("image.png");
        std::fs::write(&image_path, [0_u8, 1, 2, 3]).unwrap();

        let md_path = temp_dir.join("doc.md");
        let html = r#"<p>A</p><img alt="cover"><p>B</p><img src="image.png"><p>C</p>"#;
        let output = embed_images(html, Some(&md_path.to_string_lossy()));

        assert!(output.contains(r#"<img alt="cover">"#));
        assert!(output.contains("data:image/png;base64,AAECAw=="));
        assert!(output.contains("<p>C</p>"));

        std::fs::remove_dir_all(temp_dir).ok();
    }
}
