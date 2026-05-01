use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::image::{self, ImageService, CloudinaryConfig, PicGoConfig, S3Config, LocalImageConfig};

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