use super::ImageError;
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomApiConfig {
    pub endpoint: String,
    pub method: String,
    pub headers: Value,
    pub response_url_path: String,
}

pub async fn upload(file_path: &str, config: CustomApiConfig) -> Result<String, ImageError> {
    if config.endpoint.is_empty() {
        return Err(ImageError::Api("Custom API endpoint not configured".into()));
    }

    let file_data = tokio::fs::read(file_path).await?;
    let file_name = std::path::Path::new(file_path)
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let client = reqwest::Client::new();

    let mut request = if config.method.to_lowercase() == "post" {
        let form = multipart::Form::new()
            .part("file", multipart::Part::bytes(file_data).file_name(file_name));
        client.post(&config.endpoint).multipart(form)
    } else {
        client
            .post(&config.endpoint)
            .body(file_data)
            .header("Content-Type", "application/octet-stream")
    };

    if let Value::Object(headers_map) = &config.headers {
        for (key, value) in headers_map {
            if let Value::String(header_value) = value {
                request = request.header(key, header_value);
            }
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| ImageError::Network(e.to_string()))?;

    if !response.status().is_success() {
        return Err(ImageError::Api(format!(
            "API returned status {}",
            response.status()
        )));
    }

    let response_body: Value = response
        .json()
        .await
        .map_err(|e| ImageError::Parse(e.to_string()))?;

    extract_url(&response_body, &config.response_url_path)
}

fn extract_url(response: &Value, path: &str) -> Result<String, ImageError> {
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = response;

    for part in &parts {
        if let Value::Object(map) = current {
            current = map
                .get(*part)
                .ok_or_else(|| ImageError::Parse(format!("Path '{}' not found in response", path)))?;
        } else {
            return Err(ImageError::Parse(format!(
                "Cannot traverse '{}' at '{}'",
                part, path
            )));
        }
    }

    if let Value::String(url) = current {
        Ok(url.clone())
    } else {
        Err(ImageError::Parse("Final value is not a string URL".into()))
    }
}
