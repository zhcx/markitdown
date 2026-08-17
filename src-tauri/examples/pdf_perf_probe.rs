use base64::Engine;
use headless_chrome::browser::LaunchOptionsBuilder;
use headless_chrome::{types::PrintToPdfOptions, Browser};
use std::error::Error;
use std::ffi::OsString;
use std::net::TcpListener;
use std::time::Instant;

fn main() -> Result<(), Box<dyn Error>> {
    let paragraphs = std::env::args()
        .nth(1)
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(4_000);

    let mut body = String::with_capacity(paragraphs * 180);
    for i in 0..paragraphs {
        body.push_str(&format!(
            "<h2>Section {i}</h2><p>This is a long markdown export paragraph with enough text to exercise Chrome layout and PDF pagination across many generated pages.</p>"
        ));
    }

    let html = format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><style>
body {{ font-family: Arial, "Microsoft YaHei", sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; }}
h2 {{ border-bottom: 1px solid #ddd; }}
</style></head><body>{body}</body></html>"#
    );

    let args: Vec<OsString> = vec![
        OsString::from("--disable-gpu"),
        OsString::from("--disable-extensions"),
        OsString::from("--disable-background-networking"),
        OsString::from("--no-sandbox"),
    ];
    let args_ref: Vec<&std::ffi::OsStr> = args.iter().map(|arg| arg.as_os_str()).collect();
    let browser = Browser::new(
        LaunchOptionsBuilder::default()
            .headless(true)
            .port(Some(get_ephemeral_port()?))
            .args(args_ref)
            .build()?,
    )?;

    measure_data_url(&browser, &html)?;
    measure_file_url(&browser, &html)?;

    Ok(())
}

fn get_ephemeral_port() -> Result<u16, Box<dyn Error>> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn measure_data_url(browser: &Browser, html: &str) -> Result<(), Box<dyn Error>> {
    let tab = browser.new_tab()?;
    let data_url = format!(
        "data:text/html;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(html)
    );

    let start = Instant::now();
    tab.navigate_to(&data_url)?;
    tab.wait_until_navigated()?;
    let navigated = start.elapsed();

    tab.print_to_pdf(Some(PrintToPdfOptions::default()))?;
    let total = start.elapsed();
    tab.close(false).ok();

    println!("data_url navigation={navigated:?} total={total:?}");
    Ok(())
}

fn measure_file_url(browser: &Browser, html: &str) -> Result<(), Box<dyn Error>> {
    let tab = browser.new_tab()?;
    let path = std::env::temp_dir().join(format!("zeditor_probe_{}.html", uuid::Uuid::new_v4()));
    std::fs::write(&path, html)?;
    let file_url = format!("file:///{}", path.to_string_lossy().replace('\\', "/"));

    let start = Instant::now();
    tab.navigate_to(&file_url)?;
    tab.wait_until_navigated()?;
    let navigated = start.elapsed();

    tab.print_to_pdf(Some(PrintToPdfOptions::default()))?;
    let total = start.elapsed();
    tab.close(false).ok();
    std::fs::remove_file(path).ok();

    println!("file_url navigation={navigated:?} total={total:?}");
    Ok(())
}
