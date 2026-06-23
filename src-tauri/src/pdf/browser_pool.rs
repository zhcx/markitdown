use headless_chrome::browser::LaunchOptionsBuilder;
use headless_chrome::Browser;
use std::net::TcpListener;
use std::sync::OnceLock;

use super::error::{PdfError, PdfResult};

static BROWSER_POOL: OnceLock<Browser> = OnceLock::new();

pub fn get_browser() -> PdfResult<&'static Browser> {
    if let Some(browser) = BROWSER_POOL.get() {
        return Ok(browser);
    }

    let browser = launch_browser()?;
    let _ = BROWSER_POOL.set(browser);
    BROWSER_POOL
        .get()
        .ok_or_else(|| PdfError::ChromeInit("failed to initialize browser instance".to_string()))
}

fn launch_browser() -> PdfResult<Browser> {
    let args: Vec<std::ffi::OsString> = vec![
        std::ffi::OsString::from("--disable-gpu"),
        std::ffi::OsString::from("--disable-software-rasterizer"),
        std::ffi::OsString::from("--disable-dev-shm-usage"),
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
