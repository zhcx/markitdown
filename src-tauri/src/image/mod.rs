mod cloudinary;
mod local;
mod picgo;
mod s3;

pub use cloudinary::CloudinaryConfig;
pub use local::LocalImageConfig;
pub use picgo::PicGoConfig;
pub use s3::S3Config;

use serde::Deserialize;
use thiserror::Error;

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