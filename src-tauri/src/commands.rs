use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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
pub struct AppearanceSettings {
    pub theme: String,
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorSettings {
    pub auto_save_interval: u32,
    pub spell_check: bool,
    pub auto_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageHostingSettings {
    pub active_service: String,
    pub cloudinary: CloudinaryConfig,
    pub picgo: PicGoConfig,
    pub s3: S3Config,
    pub local: LocalImageConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSettings {
    pub pdf_margin: f32,
    pub html_template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AISettings {
    pub enabled: bool,
    pub provider: String,
    pub api_key: String,
    pub api_endpoint: String,
    pub model: String,
    pub temperature: f32,
    pub auto_suggest: bool,
    pub suggest_delay: u32,
    pub writing_style: String,
    pub custom_style_prompt: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            appearance: AppearanceSettings {
                theme: "light".to_string(),
                font_family: "Microsoft YaHei".to_string(),
                font_size: 16,
                line_height: 1.6,
            },
            editor: EditorSettings {
                auto_save_interval: 30000,
                spell_check: false,
                auto_complete: true,
            },
            image_hosting: ImageHostingSettings {
                active_service: "local".to_string(),
                cloudinary: CloudinaryConfig {
                    cloud_name: String::new(),
                    api_key: String::new(),
                    api_secret: String::new(),
                    upload_folder: Some(String::new()),
                },
                picgo: PicGoConfig {
                    server_url: "http://127.0.0.1:36677".to_string(),
                    use_cli: false,
                    cli_path: None,
                },
                s3: S3Config {
                    provider: "aliyun-oss".to_string(),
                    endpoint: String::new(),
                    bucket: String::new(),
                    region: String::new(),
                    access_key: String::new(),
                    secret_key: String::new(),
                    custom_path: None,
                    use_ssl: true,
                },
                local: LocalImageConfig {
                    save_directory: "./assets/images".to_string(),
                    naming_rule: "timestamp".to_string(),
                },
            },
            export: ExportSettings {
                pdf_margin: 20.0,
                html_template: "default".to_string(),
            },
            ai: AISettings {
                enabled: false,
                provider: "openai".to_string(),
                api_key: String::new(),
                api_endpoint: "https://api.openai.com/v1".to_string(),
                model: "gpt-4o-mini".to_string(),
                temperature: 0.7,
                auto_suggest: false,
                suggest_delay: 2000,
                writing_style: "formal".to_string(),
                custom_style_prompt: String::new(),
            },
        }
    }
}

fn get_settings_path(app: &AppHandle) -> PathBuf {
    let config_dir = app.path().app_config_dir().expect("failed to get config dir");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("settings.json")
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let path = get_settings_path(&app);
    if path.exists() {
        let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        let settings = Settings::default();
        save_settings_inner(&app, &settings)?;
        Ok(settings)
    }
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    save_settings_inner(&app, &settings)
}

fn save_settings_inner(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = get_settings_path(app);
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upload_image(
    file_path: String,
    service: String,
    settings: Settings,
) -> Result<String, String> {
    let image_service = match service.as_str() {
        "cloudinary" => ImageService::Cloudinary(settings.image_hosting.cloudinary),
        "picgo" => ImageService::PicGo(settings.image_hosting.picgo),
        "s3" => ImageService::S3(settings.image_hosting.s3),
        "local" => ImageService::Local(settings.image_hosting.local),
        _ => return Err(format!("Unknown image service: {}", service)),
    };

    image::upload(&file_path, image_service).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_pdf(content: String, _options: ExportSettings) -> Result<String, String> {
    Ok(content)
}

#[tauri::command]
pub async fn export_html(content: String, template: String) -> Result<String, String> {
    Ok(format!("template: {}, content: {}", template, content.len()))
}

#[tauri::command]
pub async fn get_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_file_content(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

fn get_recent_files_path(app: &AppHandle) -> PathBuf {
    let config_dir = app.path().app_config_dir().expect("failed to get config dir");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("recent_files.json")
}

#[tauri::command]
pub async fn get_recent_files(app: AppHandle) -> Result<Vec<RecentFile>, String> {
    let path = get_recent_files_path(&app);
    if path.exists() {
        let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn update_recent_file(app: AppHandle, path: String, title: String) -> Result<Vec<RecentFile>, String> {
    let recent_path = get_recent_files_path(&app);
    let mut recent_files: Vec<RecentFile> = if recent_path.exists() {
        let content = std::fs::read_to_string(&recent_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    // Remove existing entry for this path
    recent_files.retain(|f| f.path != path);

    // Add new entry at the beginning
    recent_files.insert(0, RecentFile {
        path,
        title,
        last_opened: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    });

    // Keep only last 20 files
    recent_files.truncate(20);

    // Save to file
    let content = serde_json::to_string_pretty(&recent_files).map_err(|e| e.to_string())?;
    std::fs::write(&recent_path, content).map_err(|e| e.to_string())?;

    Ok(recent_files)
}

#[tauri::command]
pub async fn remove_recent_file(app: AppHandle, path: String) -> Result<Vec<RecentFile>, String> {
    let recent_path = get_recent_files_path(&app);
    let mut recent_files: Vec<RecentFile> = if recent_path.exists() {
        let content = std::fs::read_to_string(&recent_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    recent_files.retain(|f| f.path != path);

    let content = serde_json::to_string_pretty(&recent_files).map_err(|e| e.to_string())?;
    std::fs::write(&recent_path, content).map_err(|e| e.to_string())?;

    Ok(recent_files)
}

#[tauri::command]
pub async fn read_folder(path: String) -> Result<Vec<FileNode>, String> {
    let mut nodes = Vec::new();

    let entries = std::fs::read_dir(&path).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_path = entry.path().to_string_lossy().to_string();
        let is_directory = metadata.is_dir();

        // Skip hidden files and common non-relevant directories
        if file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" {
            continue;
        }

        nodes.push(FileNode {
            name: file_name,
            path: file_path,
            is_directory,
            children: if is_directory { Some(Vec::new()) } else { None },
        });
    }

    // Sort: directories first, then files, both alphabetically
    nodes.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(nodes)
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let url = "https://api.github.com/repos/zhcx/markitdown/releases/latest";

    let response = client
        .get(url)
        .header("User-Agent", "MarkitDown")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API 错误: {}", response.status()));
    }

    let release: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let latest_version = release["tag_name"]
        .as_str()
        .unwrap_or("v0.0.0")
        .trim_start_matches('v')
        .to_string();

    let current_version = VERSION.to_string();

    // 比较版本号
    let has_update = compare_versions(&latest_version, &current_version)?;

    let download_url = release["html_url"]
        .as_str()
        .unwrap_or("https://github.com/zhcx/markitdown/releases")
        .to_string();

    let release_notes = release["body"]
        .as_str()
        .unwrap_or("暂无更新说明")
        .to_string();

    let published_at = release["published_at"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(UpdateInfo {
        has_update,
        current_version,
        latest_version,
        download_url,
        release_notes,
        published_at,
    })
}

fn compare_versions(latest: &str, current: &str) -> Result<bool, String> {
    let parse_version = |v: &str| -> Result<Vec<u32>, String> {
        v.split('.')
            .map(|s| s.parse::<u32>().map_err(|e| format!("版本号解析失败: {}", e)))
            .collect()
    };

    let latest_parts = parse_version(latest)?;
    let current_parts = parse_version(current)?;

    // 补齐版本号长度
    let max_len = latest_parts.len().max(current_parts.len());
    let mut latest_parts = latest_parts;
    let mut current_parts = current_parts;

    while latest_parts.len() < max_len {
        latest_parts.push(0);
    }
    while current_parts.len() < max_len {
        current_parts.push(0);
    }

    // 比较各部分
    for (l, c) in latest_parts.iter().zip(current_parts.iter()) {
        if l > c {
            return Ok(true);
        } else if l < c {
            return Ok(false);
        }
    }

    Ok(false)
}