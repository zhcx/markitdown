// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(debug_assertions)]
use tauri::Manager;

mod ai;
mod commands;
mod image;
mod pdf;

// Prevent Tauri commands from panicking across the FFI boundary.
// Replace any remaining unwrap/expect in hot paths with proper error propagation.
// clippy::unwrap_used is not enabled globally; this is a targeted hardening.

fn main() {
    // Install a global panic hook that writes to stderr instead of
    // crashing the process immediately — the Tauri runtime handles the
    // error gracefully and the window stays open.
    std::panic::set_hook(Box::new(|info| {
        let msg = info.to_string();
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let full = format!("[MARKITDOWN PANIC] {location}: {msg}");
        eprintln!("{}", full);
        // 同时写入文件，方便 Windows GUI 模式下诊断
        let log_path = std::env::temp_dir().join("markitdown_crash.log");
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
            let _ = writeln!(f, "[PANIC] {}", full);
        }
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::get_local_font_families,
            commands::upload_image,
            commands::upload_image_bytes,
            commands::export_pdf,
            commands::export_html,
            commands::export_word,
            commands::cleanup_export_file,
            commands::get_file_content,
            commands::convert_document,
            commands::save_file_content,
            commands::read_file_base64,
            commands::get_recent_files,
            commands::update_recent_file,
            commands::remove_recent_file,
            commands::read_folder,
            commands::workspace_search,
            commands::web_search,
            commands::check_for_updates,
            commands::download_and_install_update,
            ai::ai_request,
            ai::ai_streaming,
            ai::ai_chat_streaming,
            ai::fetch_ai_models,
            pdf::converter::export_pdf_direct,
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
