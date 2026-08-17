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

    let input = PdfInput {
        html_body,
        file_path,
    };

    // Chrome 启动/CDP 等待与字体检测（FontConfig::detect 会扫描系统字体）
    // 都是长阻塞操作，放到阻塞线程池执行，避免占用 tokio worker 线程。
    let window_for_blocking = window.clone();
    let pdf_bytes = tauri::async_runtime::spawn_blocking(move || {
        let engine = ChromeEngine::new();
        engine.generate_with_progress(input, &pdf_options, &window_for_blocking)
    })
    .await
    .map_err(|e| format!("PDF 导出任务失败: {}", e))?
    .map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking({
        let output_path = output_path.clone();
        move || std::fs::write(&output_path, &pdf_bytes)
    })
    .await
    .map_err(|e| format!("文件写入任务失败: {}", e))?
    .map_err(|e| format!("文件写入失败: {}", e))?;

    Ok(output_path)
}
