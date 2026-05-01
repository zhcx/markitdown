use super::ImageError;
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

type HmacSha256 = Hmac<sha2::Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Config {
    pub provider: String,
    pub endpoint: String,
    pub bucket: String,
    pub region: String,
    pub access_key: String,
    pub secret_key: String,
    pub custom_path: Option<String>,
    pub use_ssl: bool,
}

pub async fn upload(file_path: &str, config: S3Config) -> Result<String, ImageError> {
    if config.endpoint.is_empty() || config.bucket.is_empty() || config.access_key.is_empty() || config.secret_key.is_empty() {
        return Err(ImageError::Api("S3 credentials not configured".into()));
    }

    let file_data = tokio::fs::read(file_path).await?;
    let file_name = Path::new(file_path)
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let date = Utc::now().format("%Y%m%d").to_string();

    let object_key = match &config.custom_path {
        Some(path) if !path.is_empty() => {
            let path = path.trim_end_matches('/');
            format!("{}/{}", path, file_name)
        }
        _ => file_name.clone(),
    };

    let scheme = if config.use_ssl { "https" } else { "http" };
    let host = config.endpoint.replace("https://", "").replace("http://", "");
    let url = format!("{}://{}/{}", scheme, host, object_key);

    let content_type = get_content_type(&file_name);
    let payload_hash = hex::encode(Sha256::digest(&file_data));

    let canonical_request = build_canonical_request(
        "PUT",
        &format!("/{}", object_key),
        &timestamp,
        &config.region,
        &host,
        &content_type,
        &payload_hash,
    );

    let string_to_sign = build_string_to_sign(&timestamp, &date, &config.region, &canonical_request);
    let signature = calculate_signature(&config.secret_key, &date, &config.region, &string_to_sign);

    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}/{}/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature={}",
        config.access_key, date, config.region, signature
    );

    let client = reqwest::Client::new();
    let response = client
        .put(&url)
        .header("Host", &host)
        .header("Content-Type", &content_type)
        .header("x-amz-date", &timestamp)
        .header("x-amz-content-sha256", &payload_hash)
        .header("Authorization", authorization)
        .body(file_data)
        .send()
        .await
        .map_err(|e| ImageError::Network(e.to_string()))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(ImageError::Api(format!("S3 upload failed: {}", error_text)));
    }

    Ok(url)
}

fn get_content_type(file_name: &str) -> String {
    let ext = Path::new(file_name)
        .extension()
        .unwrap()
        .to_string_lossy()
        .to_lowercase();

    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    }.to_string()
}

fn build_canonical_request(
    method: &str,
    uri: &str,
    timestamp: &str,
    _region: &str,
    host: &str,
    _content_type: &str,
    payload_hash: &str,
) -> String {
    let canonical_headers = format!(
        "host:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        host, payload_hash, timestamp
    );

    let signed_headers = "host;x-amz-content-sha256;x-amz-date";

    format!(
        "{}\n{}\n\n{}\n{}\n{}",
        method, uri, canonical_headers, signed_headers, payload_hash
    )
}

fn build_string_to_sign(
    timestamp: &str,
    date: &str,
    region: &str,
    canonical_request: &str,
) -> String {
    let credential_scope = format!("{}/{}/s3/aws4_request", date, region);
    let request_hash = hex::encode(Sha256::digest(canonical_request.as_bytes()));

    format!("AWS4-HMAC-SHA256\n{}\n{}\n{}", timestamp, credential_scope, request_hash)
}

fn calculate_signature(secret_key: &str, date: &str, region: &str, string_to_sign: &str) -> String {
    let k_date = hmac_sha256(format!("AWS4{}", secret_key).as_bytes(), date.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, b"s3");
    let k_signing = hmac_sha256(&k_service, b"aws4_request");
    let signature = hmac_sha256(&k_signing, string_to_sign.as_bytes());

    hex::encode(signature)
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC creation failed");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}