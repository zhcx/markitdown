use tauri::{AppHandle, Manager};

use crate::commands::ExportSettings;

use super::chrome::ChromeEngine;
use super::engine::PdfInput;
use super::PdfExportOptions;

/// 直接导出 PDF 到指定路径（使用 Chrome 引擎）
#[tauri::command]
pub async fn export_pdf_direct(
    app: AppHandle,
    html_body: String,
    output_path: String,
    _settings: ExportSettings,
    options: Option<PdfExportOptions>,
    file_path: Option<String>,
) -> Result<String, String> {
    let pdf_options = options.unwrap_or_default();

    // 获取主窗口用于发送进度事件
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "无法获取窗口".to_string())?;

    let engine = ChromeEngine::new();

    let input = PdfInput {
        html_body,
        file_path,
    };

    // 使用带进度反馈的方法
    let pdf_bytes = engine
        .generate_with_progress(input, &pdf_options, &window)
        .map_err(|e| e.to_string())?;

    std::fs::write(&output_path, &pdf_bytes).map_err(|e| format!("文件写入失败: {}", e))?;

    Ok(output_path)
}
