use super::ImageError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PicGoConfig {
    pub server_url: String,
    pub use_cli: bool,
    pub cli_path: Option<String>,
}

pub async fn upload(file_path: &str, config: PicGoConfig) -> Result<String, ImageError> {
    if config.use_cli {
        upload_via_cli(file_path, &config).await
    } else {
        upload_via_server(file_path, &config).await
    }
}

async fn upload_via_server(file_path: &str, config: &PicGoConfig) -> Result<String, ImageError> {
    let client = reqwest::Client::new();

    #[derive(serde::Serialize)]
    struct PicGoRequest {
        list: Vec<String>,
    }

    let request_body = PicGoRequest {
        list: vec![file_path.to_string()],
    };

    let url = format!("{}/upload", config.server_url);

    let response = client
        .post(&url)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| ImageError::Network(e.to_string()))?;

    if !response.status().is_success() {
        return Err(ImageError::Api(format!(
            "PicGo server error: {}",
            response.status()
        )));
    }

    #[derive(Deserialize)]
    struct PicGoResponse {
        success: bool,
        #[serde(default)]
        result: Vec<String>,
        #[serde(default)]
        message: Option<String>,
    }

    let result: PicGoResponse = response
        .json()
        .await
        .map_err(|e| ImageError::Parse(e.to_string()))?;

    if !result.success {
        return Err(ImageError::Api(
            result.message.unwrap_or_else(|| "PicGo upload failed".into()),
        ));
    }

    result
        .result
        .first()
        .cloned()
        .ok_or_else(|| ImageError::Api("No URL returned from PicGo".into()))
}

async fn upload_via_cli(file_path: &str, config: &PicGoConfig) -> Result<String, ImageError> {
    let cli_path = config
        .cli_path
        .as_ref()
        .ok_or_else(|| ImageError::Api("PicGo CLI path not configured".into()))?;

    let output = tokio::process::Command::new(cli_path)
        .arg("upload")
        .arg(file_path)
        .output()
        .await
        .map_err(|e| ImageError::Io(e))?;

    if !output.status.success() {
        return Err(ImageError::Api(format!(
            "PicGo CLI failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_picgo_output(&stdout)
}

fn parse_picgo_output(output: &str) -> Result<String, ImageError> {
    for line in output.lines() {
        if line.starts_with("http://") || line.starts_with("https://") {
            return Ok(line.trim().to_string());
        }
    }
    Err(ImageError::Parse("No URL found in PicGo output".into()))
}