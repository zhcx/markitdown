use headless_chrome::browser::LaunchOptionsBuilder;
use headless_chrome::Browser;
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use super::error::{PdfError, PdfResult};

/// 浏览器槽位。相比之前的 `OnceLock<Browser>`：
/// 1. `Mutex` 串行化初始化，消除并发 `get_browser` 各自启动 Chrome、
///    `set()` 失败一方被丢弃而产生孤儿 Chrome 进程的竞态；
/// 2. Chrome 崩溃后可通过 `invalidate_browser()` 清空槽位并重建，
///    之前 OnceLock 一旦写入便永远无法恢复。
static BROWSER_SLOT: Mutex<Option<Arc<Browser>>> = Mutex::new(None);

fn lock_slot() -> std::sync::MutexGuard<'static, Option<Arc<Browser>>> {
    BROWSER_SLOT
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn get_browser() -> PdfResult<Arc<Browser>> {
    let mut slot = lock_slot();
    if let Some(browser) = slot.as_ref() {
        return Ok(browser.clone());
    }
    let browser = Arc::new(launch_browser()?);
    *slot = Some(browser.clone());
    Ok(browser)
}

/// Chrome 实例失效（崩溃/被杀）后调用：丢弃池化实例，
/// 下次 `get_browser` 将重新启动浏览器。
pub fn invalidate_browser() {
    *lock_slot() = None;
}

fn launch_browser() -> PdfResult<Browser> {
    let args: Vec<std::ffi::OsString> = vec![
        std::ffi::OsString::from("--disable-gpu"),
        std::ffi::OsString::from("--disable-software-rasterizer"),
        std::ffi::OsString::from("--disable-dev-shm-usage"),
        // 沙箱说明：Linux 无特权容器/CI 环境下默认沙箱无法启动，故保留
        // --no-sandbox。安全上依赖 PDF 渲染前通过 CDP 禁用页面 JavaScript
        // （见 chrome.rs generate_pdf_via_chrome），阻止文档内嵌脚本在
        // file:// 源下执行。
        std::ffi::OsString::from("--no-sandbox"),
        std::ffi::OsString::from("--disable-setuid-sandbox"),
        std::ffi::OsString::from("--disable-extensions"),
        std::ffi::OsString::from("--disable-default-apps"),
        std::ffi::OsString::from("--disable-translate"),
        std::ffi::OsString::from("--disable-sync"),
        std::ffi::OsString::from("--metrics-recording-only"),
        std::ffi::OsString::from("--disable-background-networking"),
        std::ffi::OsString::from("--disable-breakpad"),
        std::ffi::OsString::from("--disable-component-update"),
        std::ffi::OsString::from("--disable-domain-reliability"),
        std::ffi::OsString::from("--disable-features=TranslateUI"),
        std::ffi::OsString::from("--disable-hang-monitor"),
        std::ffi::OsString::from("--disable-ipc-flood-protection"),
        std::ffi::OsString::from("--disable-popup-blocking"),
        std::ffi::OsString::from("--disable-prompt-on-repost"),
        std::ffi::OsString::from("--disable-client-side-phishing-detection"),
    ];
    let args_ref: Vec<&std::ffi::OsStr> = args.iter().map(|s| s.as_os_str()).collect();
    let debug_port = get_ephemeral_port()?;

    let launch_options = LaunchOptionsBuilder::default()
        .headless(true)
        .port(Some(debug_port))
        .args(args_ref)
        .build()
        .map_err(|e| PdfError::ChromeInit(e.to_string()))?;

    Browser::new(launch_options).map_err(|e| PdfError::ChromeInit(e.to_string()))
}

fn get_ephemeral_port() -> PdfResult<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| {
        PdfError::ChromeInit(format!("failed to allocate Chrome debugging port: {}", e))
    })?;
    let port = listener
        .local_addr()
        .map_err(|e| PdfError::ChromeInit(format!("failed to read Chrome debugging port: {}", e)))?
        .port();
    drop(listener);
    Ok(port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_ephemeral_port_returns_bindable_local_port() {
        let port = get_ephemeral_port().unwrap();
        let listener = TcpListener::bind(("127.0.0.1", port));

        assert!(listener.is_ok());
    }
}
