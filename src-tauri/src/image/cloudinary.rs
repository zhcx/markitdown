use super::ImageError;
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudinaryConfig {
    pub cloud_name: String,
    pub api_key: String,
    pub api_secret: String,
    pub upload_folder: Option<String>,
}

pub async fn upload(file_path: &str, config: CloudinaryConfig) -> Result<String, ImageError> {
    if config.cloud_name.is_empty() || config.api_key.is_empty() || config.api_secret.is_empty() {
        return Err(ImageError::Api("Cloudinary credentials not configured".into()));
    }

    let file_data = tokio::fs::read(file_path).await?;
    let timestamp = chrono::Utc::now().timestamp().to_string();

    let folder = config.upload_folder.as_deref().unwrap_or("");
    let public_id = generate_public_id(file_path);

    let signature_string = if folder.is_empty() {
        format!(
            "public_id={}timestamp={}{}",
            public_id, timestamp, config.api_secret
        )
    } else {
        format!(
            "folder={}public_id={}timestamp={}{}",
            folder, public_id, timestamp, config.api_secret
        )
    };

    let mut hasher = Sha1::new();
    hasher.update(signature_string.as_bytes());
    let signature = hex::encode(hasher.finalize());

    let url = format!(
        "https://api.cloudinary.com/v1_1/{}/image/upload",
        config.cloud_name
    );

    let client = reqwest::Client::new();
    let mut form = multipart::Form::new()
        .text("api_key", config.api_key.clone())
        .text("timestamp", timestamp.clone())
        .text("signature", signature)
        .text("public_id", public_id.clone())
        .part(
            "file",
            multipart::Part::bytes(file_data).file_name(
                std::path::Path::new(file_path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string(),
            ),
        );

    if !folder.is_empty() {
        form = form.text("folder", folder.to_string());
    }

    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| ImageError::Network(e.to_string()))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(ImageError::Api(format!("Upload failed: {}", error_text)));
    }

    #[derive(Deserialize)]
    struct CloudinaryResponse {
        secure_url: String,
    }

    let result: CloudinaryResponse = response
        .json()
        .await
        .map_err(|e| ImageError::Parse(e.to_string()))?;

    Ok(result.secure_url)
}

fn generate_public_id(file_path: &str) -> String {
    let stem = std::path::Path::new(file_path)
        .file_stem()
        .unwrap()
        .to_string_lossy();
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    format!("{}_{}", stem, timestamp)
}