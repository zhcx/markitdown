mod cloudinary;
mod local;
mod picgo;
mod s3;

pub use cloudinary::CloudinaryConfig;
pub use local::LocalImageConfig;
pub use picgo::PicGoConfig;
pub use s3::S3Config;

use serde::Deserialize;
use std::{sync::OnceLock, time::Duration};
use thiserror::Error;

static IMAGE_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub(super) fn http_client() -> Result<reqwest::Client, ImageError> {
    if let Some(client) = IMAGE_HTTP_CLIENT.get() {
        return Ok(client.clone());
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| ImageError::Network(format!("Unable to create upload client: {error}")))?;
    Ok(IMAGE_HTTP_CLIENT.get_or_init(|| client).clone())
}

pub(super) async fn read_upload_file(path: &std::path::Path) -> Result<Vec<u8>, ImageError> {
    const MAX_UPLOAD_BYTES: u64 = 50 * 1024 * 1024;
    let size = tokio::fs::metadata(path).await?.len();
    if size > MAX_UPLOAD_BYTES {
        return Err(ImageError::Api(
            "Image is larger than the 50 MB upload limit".into(),
        ));
    }
    let bytes = tokio::fs::read(path).await?;
    if bytes.len() as u64 > MAX_UPLOAD_BYTES {
        return Err(ImageError::Api(
            "Image grew beyond the 50 MB upload limit while reading".into(),
        ));
    }
    Ok(bytes)
}

#[derive(Debug, Error)]
pub enum ImageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Network error: {0}")]
    Network(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("API error: {0}")]
    Api(String),
}

#[derive(Debug, Clone, Deserialize)]
pub enum ImageService {
    Cloudinary(CloudinaryConfig),
    PicGo(PicGoConfig),
    S3(S3Config),
    Local(LocalImageConfig),
}

pub async fn upload(file_path: &str, service: ImageService) -> Result<String, ImageError> {
    match service {
        ImageService::Cloudinary(config) => cloudinary::upload(file_path, config).await,
        ImageService::PicGo(config) => picgo::upload(file_path, config).await,
        ImageService::S3(config) => s3::upload(file_path, config).await,
        ImageService::Local(config) => local::save(file_path, config).await,
    }
}
