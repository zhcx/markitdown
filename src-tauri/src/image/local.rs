use super::ImageError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalImageConfig {
    pub save_directory: String,
    pub naming_rule: String,
}

pub async fn save(file_path: &str, config: LocalImageConfig) -> Result<String, ImageError> {
    let source_path = PathBuf::from(file_path);

    let file_name = generate_filename(&source_path, &config.naming_rule);

    let save_dir = PathBuf::from(&config.save_directory);
    tokio::fs::create_dir_all(&save_dir).await?;

    let dest_path = save_dir.join(&file_name);

    tokio::fs::copy(&source_path, &dest_path).await?;

    Ok(format!("assets/images/{}", file_name))
}

fn generate_filename(source: &Path, naming_rule: &str) -> String {
    let extension = source
        .extension()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let base_name = match naming_rule {
        "timestamp" => chrono::Utc::now().format("%Y%m%d%H%M%S").to_string(),
        "uuid" => Uuid::new_v4().to_string(),
        "original" => source
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .to_string(),
        _ => chrono::Utc::now().format("%Y%m%d%H%M%S").to_string(),
    };

    format!("{}.{}", base_name, extension)
}
