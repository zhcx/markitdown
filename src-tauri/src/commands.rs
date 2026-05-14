use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose, Engine as _};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use crate::image::{self, ImageService, CloudinaryConfig, PicGoConfig, S3Config, LocalImageConfig};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub download_url: String,
    pub release_notes: String,
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentFile {
    pub path: String,
    pub title: String,
    pub last_opened: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub appearance: AppearanceSettings,
    pub editor: EditorSettings,
    pub image_hosting: ImageHostingSettings,
    pub export: ExportSettings,
    pub ai: AISettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceSettings { pub theme: String, pub font_family: String, pub font_size: u32, pub line_height: f32 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorSettings { pub auto_save_interval: u32, pub spell_check: bool, pub auto_complete: bool }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageHostingSettings {
    pub active_service: String,
    pub cloudinary: CloudinaryConfig,
    pub picgo: PicGoConfig,
    pub s3: S3Config,
    pub local: LocalImageConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSettings { pub pdf_margin: f32, pub html_template: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AISettings {
    pub enabled: bool, pub provider: String, pub api_key: String,
    pub api_endpoint: String, pub model: String, pub temperature: f32,
    pub auto_suggest: bool, pub suggest_delay: u32,
    pub writing_style: String, pub custom_style_prompt: String,
    pub provider_api_keys: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            appearance: AppearanceSettings { theme: "light".into(), font_family: "Microsoft YaHei".into(), font_size: 16, line_height: 1.6 },
            editor: EditorSettings { auto_save_interval: 30000, spell_check: false, auto_complete: true },
            image_hosting: ImageHostingSettings {
                active_service: "local".into(),
                cloudinary: CloudinaryConfig { cloud_name: String::new(), api_key: String::new(), api_secret: String::new(), upload_folder: Some(String::new()) },
                picgo: PicGoConfig { server_url: "http://127.0.0.1:36677".into(), use_cli: false, cli_path: None },
                s3: S3Config { provider: "aliyun-oss".into(), endpoint: String::new(), bucket: String::new(), region: String::new(), access_key: String::new(), secret_key: String::new(), custom_path: None, use_ssl: true },
                local: LocalImageConfig { save_directory: "./assets/images".into(), naming_rule: "timestamp".into() },
            },
            export: ExportSettings { pdf_margin: 20.0, html_template: "default".into() },
            ai: AISettings { enabled: false, provider: "openai".into(), api_key: String::new(), api_endpoint: "https://api.openai.com/v1".into(), model: "gpt-4o-mini".into(), temperature: 0.7, auto_suggest: false, suggest_delay: 2000, writing_style: "formal".into(), custom_style_prompt: String::new(), provider_api_keys: "{}".into() },
        }
    }
}

fn get_settings_path(app: &AppHandle) -> PathBuf {
    let config_dir = app.path().app_config_dir().expect("config dir");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("settings.json")
}

#[tauri::command] pub async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let path = get_settings_path(&app);
    if path.exists() { Ok(serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?) }
    else { let s = Settings::default(); save_settings_inner(&app, &s)?; Ok(s) }
}

#[tauri::command] pub async fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> { save_settings_inner(&app, &settings) }

fn save_settings_inner(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = get_settings_path(app);
    std::fs::write(path, serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command] pub async fn upload_image(file_path: String, service: String, settings: Settings) -> Result<String, String> {
    let image_service = match service.as_str() {
        "cloudinary" => ImageService::Cloudinary(settings.image_hosting.cloudinary),
        "picgo" => ImageService::PicGo(settings.image_hosting.picgo),
        "s3" => ImageService::S3(settings.image_hosting.s3),
        "local" => ImageService::Local(settings.image_hosting.local),
        _ => return Err(format!("Unknown image service: {}", service)),
    };
    image::upload(&file_path, image_service).await.map_err(|e| e.to_string())
}

// ── Image embedding ────────────────────────────────────

fn guess_mime(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif",
        "svg" => "image/svg+xml", "webp" => "image/webp", "bmp" => "image/bmp",
        _ => "image/png",
    }
}

fn resolve_image_src(md_file_path: Option<&str>, src: &str) -> Option<String> {
    if src.starts_with("http://") || src.starts_with("https://") || src.starts_with("data:") { return None; }
    let p = Path::new(src);
    let resolved = if p.is_absolute() { p.to_path_buf() }
        else if let Some(md) = md_file_path { Path::new(md).parent().map(|d| d.join(p)).unwrap_or(p.to_path_buf()) }
        else { return None; };
    if !resolved.exists() { return None; }
    let data = std::fs::read(&resolved).ok()?;
    let mime = guess_mime(&resolved);
    Some(format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(&data)))
}

/// Replace every local <img src="..."> with a base64 data URL.
fn embed_images(html: &str, md_file_path: Option<&str>) -> String {
    let mut result = String::with_capacity(html.len());
    let mut rest = html;

    loop {
        let tag_start = match rest.find("<img") { Some(i) => i, None => { result.push_str(rest); break; } };
        result.push_str(&rest[..tag_start]);
        let after_tag = &rest[tag_start..];

        // find src="..."
        let src_key = match after_tag.find("src=\"") {
            Some(i) => i + 5,
            None => { result.push_str(after_tag); break; }
        };
        let src_end = match after_tag[src_key..].find('"') {
            Some(i) => src_key + i,
            None => { result.push_str(after_tag); break; }
        };
        let src_val = &after_tag[src_key..src_end];

        // find closing >
        let tag_end = match after_tag.find('>') {
            Some(i) => i + 1,
            None => { result.push_str(after_tag); break; }
        };

        if let Some(data_url) = resolve_image_src(md_file_path, src_val) {
            // reconstruct the tag with the new src
            result.push_str(&after_tag[..src_key]);
            result.push_str(&data_url);
            result.push_str(&after_tag[src_end..tag_end]);
        } else {
            result.push_str(&after_tag[..tag_end]);
        }

        rest = &after_tag[tag_end..];
    }
    result
}

// ── HTML page wrapper ──────────────────────────────────

fn wrap_html_page(body: &str, margin_mm: f32) -> String {
    format!(r##"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MarkitDown Export</title>
<style>
@page {{ margin: {margin}mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif; font-size: 16px; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 20px; }}
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
@media print {{
    body {{ padding: 0; }}
    pre {{ white-space: pre-wrap; word-wrap: break-word; }}
    a {{ word-wrap: break-word; overflow-wrap: break-word; word-break: break-all; }}
}}
</style>
</head>
<body>
{body}
<script>window.onload = function() {{ setTimeout(function() {{ window.print(); }}, 500); }};</script>
</body>
</html>"##, margin=margin_mm, body=body)
}

// ── Commands ───────────────────────────────────────────

#[tauri::command]
pub async fn export_html(html_body: String, settings: ExportSettings, file_path: Option<String>) -> Result<String, String> {
    let with_images = embed_images(&html_body, file_path.as_deref());
    Ok(wrap_html_page(&with_images, settings.pdf_margin))
}

#[tauri::command]
pub async fn export_pdf(html_body: String, settings: ExportSettings, file_path: Option<String>) -> Result<String, String> {
    let with_images = embed_images(&html_body, file_path.as_deref());
    let full = wrap_html_page(&with_images, settings.pdf_margin);
    let temp_dir = std::env::temp_dir();
    let temp_html = temp_dir.join(format!("markitdown_export_{}.html", uuid::Uuid::new_v4()));
    std::fs::write(&temp_html, full).map_err(|e| format!("{}", e))?;
    // Return as file:// URL so the shell plugin can open it
    let url = format!("file:///{}", temp_html.to_string_lossy().replace('\\', "/"));
    Ok(url)
}

#[tauri::command] pub async fn cleanup_export_file(path: String) -> Result<(), String> { std::fs::remove_file(&path).ok(); Ok(()) }

fn read_utf8_text_file(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let content = String::from_utf8(bytes)
        .map_err(|_| "文件不是 UTF-8 编码，请先转换为 UTF-8 后再打开。".to_string())?;
    Ok(content.strip_prefix('\u{feff}').unwrap_or(&content).to_string())
}

fn write_utf8_text_file(path: &str, content: &str) -> Result<(), String> {
    std::fs::write(path, content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command] pub async fn get_file_content(path: String) -> Result<String, String> { read_utf8_text_file(&path) }
#[tauri::command] pub async fn save_file_content(path: String, content: String) -> Result<(), String> { write_utf8_text_file(&path, &content) }

fn get_recent_files_path(app: &AppHandle) -> PathBuf {
    let d = app.path().app_config_dir().expect("config dir");
    std::fs::create_dir_all(&d).ok();
    d.join("recent_files.json")
}
#[tauri::command] pub async fn get_recent_files(app: AppHandle) -> Result<Vec<RecentFile>, String> {
    let p = get_recent_files_path(&app);
    Ok(if p.exists() { serde_json::from_str(&std::fs::read_to_string(p).map_err(|e| e.to_string())?).unwrap_or_default() } else { Vec::new() })
}
#[tauri::command] pub async fn update_recent_file(app: AppHandle, path: String, title: String) -> Result<Vec<RecentFile>, String> {
    let rp = get_recent_files_path(&app);
    let mut recent: Vec<RecentFile> = if rp.exists() { serde_json::from_str(&std::fs::read_to_string(&rp).map_err(|e| e.to_string())?).unwrap_or_default() } else { Vec::new() };
    recent.retain(|f| f.path != path);
    recent.insert(0, RecentFile { path, title, last_opened: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) });
    recent.truncate(20);
    std::fs::write(&rp, serde_json::to_string_pretty(&recent).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(recent)
}
#[tauri::command] pub async fn remove_recent_file(app: AppHandle, path: String) -> Result<Vec<RecentFile>, String> {
    let rp = get_recent_files_path(&app);
    let mut recent: Vec<RecentFile> = if rp.exists() { serde_json::from_str(&std::fs::read_to_string(&rp).map_err(|e| e.to_string())?).unwrap_or_default() } else { Vec::new() };
    recent.retain(|f| f.path != path);
    std::fs::write(&rp, serde_json::to_string_pretty(&recent).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(recent)
}

#[tauri::command] pub async fn read_folder(path: String) -> Result<Vec<FileNode>, String> {
    let mut nodes = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let e = entry.map_err(|e| e.to_string())?;
        let m = e.metadata().map_err(|e| e.to_string())?;
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" { continue; }
        let is_dir = m.is_dir();
        nodes.push(FileNode { name, path: e.path().to_string_lossy().to_string(), is_directory: is_dir, children: if is_dir { Some(Vec::new()) } else { None } });
    }
    nodes.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less, (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(nodes)
}

#[tauri::command] pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(30)).connect_timeout(Duration::from_secs(10)).build().map_err(|e| format!("HTTP: {}", e))?;
    let resp = client.get("https://api.github.com/repos/zhcx/markitdown/releases/latest").header("User-Agent", "MarkitDown").header("Accept", "application/vnd.github.v3+json").send().await.map_err(|e| format!("Network: {}", e))?;
    if !resp.status().is_success() { return Err(format!("API: {}", resp.status())); }
    let rel: serde_json::Value = resp.json().await.map_err(|e| format!("JSON: {}", e))?;
    let latest = rel["tag_name"].as_str().unwrap_or("v0.0.0").trim_start_matches('v').to_string();
    let current = VERSION.to_string();
    let has_update = compare_versions(&latest, &current)?;
    Ok(UpdateInfo { has_update, current_version: current, latest_version: latest, download_url: rel["html_url"].as_str().unwrap_or("https://github.com/zhcx/markitdown/releases").into(), release_notes: rel["body"].as_str().unwrap_or("暂无更新说明").into(), published_at: rel["published_at"].as_str().unwrap_or("").into() })
}

fn compare_versions(latest: &str, current: &str) -> Result<bool, String> {
    let parse = |v: &str| -> Result<Vec<u32>, String> { v.split('.').map(|s| s.parse::<u32>().map_err(|e| format!("{}", e))).collect() };
    let mut lp = parse(latest)?; let mut cp = parse(current)?;
    while lp.len() < cp.len() { lp.push(0); } while cp.len() < lp.len() { cp.push(0); }
    for (l, c) in lp.iter().zip(cp.iter()) { if l > c { return Ok(true); } else if l < c { return Ok(false); } }
    Ok(false)
}
