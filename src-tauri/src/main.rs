// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(debug_assertions)]
use tauri::Manager;

mod ai;
mod commands;
mod image;
mod pdf;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::upload_image,
            commands::export_pdf,
            commands::export_html,
            commands::cleanup_export_file,
            commands::get_file_content,
            commands::save_file_content,
            commands::read_file_base64,
            commands::get_recent_files,
            commands::update_recent_file,
            commands::remove_recent_file,
            commands::read_folder,
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
