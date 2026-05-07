use headless_chrome::Browser;
use headless_chrome::browser::LaunchOptionsBuilder;
use std::sync::OnceLock;

use super::error::{PdfError, PdfResult};

/// 全局浏览器实例池
static BROWSER_POOL: OnceLock<PdfResult<Browser>> = OnceLock::new();

/// 获取或初始化浏览器实例
pub fn get_browser() -> PdfResult<&'static Browser> {
    let result = BROWSER_POOL.get_or_init(|| {
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

        let launch_options = LaunchOptionsBuilder::default()
            .headless(true)
            .args(args_ref)
            .build()
            .map_err(|e| PdfError::ChromeInit(e.to_string()));

        match launch_options {
            Ok(opts) => Browser::new(opts).map_err(|e| PdfError::ChromeInit(e.to_string())),
            Err(e) => Err(e),
        }
    });

    match result {
        Ok(browser) => Ok(browser),
        Err(e) => Err(PdfError::ChromeInit(e.to_string())),
    }
}
