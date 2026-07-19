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

    let file_name = generate_filename(&source_path, &config.naming_rule)?;

    let save_dir = PathBuf::from(&config.save_directory);
    tokio::fs::create_dir_all(&save_dir).await?;

    let dest_path = save_dir.join(&file_name);

    tokio::fs::copy(&source_path, &dest_path).await?;

    Ok(dest_path.to_string_lossy().replace('\\', "/"))
}

fn generate_filename(source: &Path, naming_rule: &str) -> Result<String, ImageError> {
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ImageError::Api("Image file has no valid extension".into()))?
        .to_string();

    let base_name = match naming_rule {
        "timestamp" => chrono::Utc::now().format("%Y%m%d%H%M%S").to_string(),
        "uuid" => Uuid::new_v4().to_string(),
        "original" => source
            .file_stem()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| ImageError::Api("Image file has no valid name".into()))?
            .to_string(),
        _ => chrono::Utc::now().format("%Y%m%d%H%M%S").to_string(),
    };

    Ok(format!("{}.{}", base_name, extension))
}

#[cfg(test)]
mod tests {
    use super::generate_filename;
    use std::path::Path;

    #[test]
    fn original_naming_preserves_a_valid_file_name() {
        let generated = generate_filename(Path::new("cover.final.PNG"), "original");
        assert!(generated.is_ok());
        assert_eq!(generated.ok().as_deref(), Some("cover.final.PNG"));
    }

    #[test]
    fn nameless_or_extensionless_images_are_rejected_without_panicking() {
        assert!(generate_filename(Path::new("cover"), "original").is_err());
        assert!(generate_filename(Path::new(".png"), "original").is_err());
    }
}
