use serde::Serialize;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const MODULE_ID: &str = "document-converter";
const ENGINE: &str = "anydoc";
const PROTOCOL_VERSION: u32 = 1;
const SUPPORTED_FORMATS: &[&str] = &[
    "doc", "docx", "docm", "ppt", "pps", "pot", "pptx", "pptm", "ppsx", "ppsm", "xls", "xlsx",
    "xlsm", "xlsb", "odt", "ods", "odp", "rtf", "epub", "csv", "pdf",
];

#[derive(Debug, Serialize)]
struct VersionInfo {
    module_id: &'static str,
    engine: &'static str,
    version: &'static str,
    protocol_version: u32,
    target: &'static str,
    supported_formats: &'static [&'static str],
}

#[derive(Debug, Serialize)]
struct SuccessResponse<'a> {
    ok: bool,
    protocol_version: u32,
    output_path: &'a str,
    warnings: &'static [&'static str],
}

#[derive(Debug, Serialize)]
struct ErrorResponse<'a> {
    ok: bool,
    error_code: &'static str,
    message: &'a str,
}

fn target_triple() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64")
    )))]
    {
        "unsupported"
    }
}

fn write_json_stderr(message: &str) -> ! {
    let response = ErrorResponse {
        ok: false,
        error_code: "conversion_failed",
        message,
    };
    eprintln!("{}", serde_json::to_string(&response).unwrap_or_else(|_| {
        "{\"ok\":false,\"error_code\":\"conversion_failed\",\"message\":\"serialization failed\"}".to_string()
    }));
    std::process::exit(1);
}

fn write_markdown_atomically(output: &Path, markdown: &str) -> Result<(), String> {
    if markdown.trim().is_empty() {
        return Err("AnyDoc returned empty Markdown".to_string());
    }
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("create output directory: {error}"))?;
    }
    let temporary = PathBuf::from(format!("{}.partial", output.display()));
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary)
        .map_err(|error| format!("create partial output: {error}"))?;
    file.write_all(markdown.as_bytes())
        .map_err(|error| format!("write Markdown: {error}"))?;
    file.flush()
        .map_err(|error| format!("flush Markdown: {error}"))?;
    drop(file);
    fs::rename(&temporary, output).map_err(|error| format!("replace output: {error}"))?;
    Ok(())
}

fn print_version() {
    let info = VersionInfo {
        module_id: MODULE_ID,
        engine: ENGINE,
        version: env!("CARGO_PKG_VERSION"),
        protocol_version: PROTOCOL_VERSION,
        target: target_triple(),
        supported_formats: SUPPORTED_FORMATS,
    };
    println!(
        "{}",
        serde_json::to_string(&info).expect("version metadata is serializable")
    );
}

fn convert(source: &Path, output: &Path) -> Result<(), String> {
    if !source.is_file() {
        return Err(format!("selected path is not a file: {}", source.display()));
    }
    let markdown = anydoc::to_markdown(source)
        .map_err(|error| format!("AnyDoc conversion failed: {error}"))?;
    write_markdown_atomically(output, &markdown)
}

fn main() {
    let arguments: Vec<String> = env::args().skip(1).collect();
    if arguments == ["--version-json"] {
        print_version();
        return;
    }
    if arguments.len() != 2 {
        write_json_stderr("usage: document_converter <input-file> <output-markdown-file>");
    }
    let source = Path::new(&arguments[0]);
    let output = Path::new(&arguments[1]);
    if let Err(error) = convert(source, output) {
        write_json_stderr(&error);
    }
    let response = SuccessResponse {
        ok: true,
        protocol_version: PROTOCOL_VERSION,
        output_path: &arguments[1],
        warnings: &[],
    };
    println!(
        "{}",
        serde_json::to_string(&response).expect("success response is serializable")
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_zeditor_anydoc_metadata() {
        assert_eq!(MODULE_ID, "document-converter");
        assert_eq!(ENGINE, "anydoc");
        assert_eq!(PROTOCOL_VERSION, 1);
        assert!(SUPPORTED_FORMATS.contains(&"doc"));
        assert!(SUPPORTED_FORMATS.contains(&"pdf"));
        assert!(!SUPPORTED_FORMATS.contains(&"mp3"));
    }

    #[test]
    fn writes_markdown_to_a_partial_file_then_renames_it() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let output = directory.path().join("result.md");
        write_markdown_atomically(&output, "# Zeditor\n").expect("atomic write");
        assert_eq!(
            fs::read_to_string(&output).expect("output exists"),
            "# Zeditor\n"
        );
        assert!(!output.with_extension("md.partial").exists());
    }
}
