use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    process::Command,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn hide_console(command: &mut Command) {
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
}

pub fn system_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    hide_console(&mut command);
    command
}

pub fn discover_executable(name: &str) -> Option<PathBuf> {
    let mut directories: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|value| std::env::split_paths(&value).collect())
        .unwrap_or_default();

    #[cfg(windows)]
    {
        if let Some(path) = std::env::var_os("APPDATA") {
            directories.push(PathBuf::from(path).join("npm"));
        }
        if let Some(path) = std::env::var_os("LOCALAPPDATA") {
            directories.push(
                PathBuf::from(path)
                    .join("Microsoft")
                    .join("WinGet")
                    .join("Links"),
            );
        }
        if let Some(path) = std::env::var_os("USERPROFILE") {
            let root = PathBuf::from(path);
            directories.push(root.join(".local").join("bin"));
            directories.push(root.join(".cargo").join("bin"));
        }
    }

    discover_in_directories(name, directories)
}

fn discover_in_directories(
    name: &str,
    directories: impl IntoIterator<Item = PathBuf>,
) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    for directory in directories {
        #[cfg(windows)]
        {
            candidates.extend(
                ["exe", "com", "cmd", "bat"]
                    .map(|extension| directory.join(name).with_extension(extension)),
            );
            candidates.push(directory.join(name));
        }
        #[cfg(not(windows))]
        candidates.push(directory.join(name));
    }
    select_discovered(candidates)
}

pub fn executable_command(executable: &Path) -> Result<Command, String> {
    #[cfg(windows)]
    let mut command = {
        let extension = executable
            .extension()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase();
        match extension.as_str() {
            "cmd" | "bat" => {
                let shell = std::env::var_os("ComSpec").unwrap_or_else(|| "cmd.exe".into());
                let mut command = Command::new(shell);
                command.args(["/D", "/S", "/C", "call"]).arg(executable);
                command
            }
            "ps1" => {
                return Err("Windows PowerShell 脚本不能直接作为 Agent 可执行文件；请指定 .exe、.cmd 或 .bat".into());
            }
            _ => Command::new(executable),
        }
    };

    #[cfg(not(windows))]
    let mut command = Command::new(executable);

    hide_console(&mut command);
    Ok(command)
}

pub fn tokio_executable_command(executable: &Path) -> Result<tokio::process::Command, String> {
    Ok(tokio::process::Command::from(executable_command(
        executable,
    )?))
}

pub fn resolve_executable(path: PathBuf) -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        let extension = path.extension().and_then(OsStr::to_str).unwrap_or_default();
        if extension.is_empty() {
            for candidate_extension in ["exe", "com", "cmd", "bat"] {
                let candidate = path.with_extension(candidate_extension);
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
            return Err(format!(
                "{} 不是可执行的 Windows 程序；请指定 .exe、.cmd 或 .bat 文件",
                path.display()
            ));
        }
        if extension.eq_ignore_ascii_case("ps1") {
            return Err(
                "Windows PowerShell 脚本不能直接作为 Agent 可执行文件；请指定 .exe、.cmd 或 .bat"
                    .into(),
            );
        }
    }
    if !path.is_file() {
        return Err(format!("Agent 可执行文件不存在：{}", path.display()));
    }
    Ok(path)
}

pub fn select_discovered(paths: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    let mut paths: Vec<PathBuf> = paths.into_iter().filter(|path| path.is_file()).collect();
    #[cfg(windows)]
    paths.sort_by_key(|path| {
        match path
            .extension()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str()
        {
            "exe" | "com" => 0,
            "cmd" | "bat" => 1,
            "ps1" => 3,
            _ => 2,
        }
    });
    paths
        .into_iter()
        .find_map(|path| resolve_executable(path).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[cfg(windows)]
    #[test]
    fn discovery_prefers_native_exe_over_npm_shims() {
        let root =
            std::env::temp_dir().join(format!("markitdown-process-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let shell_shim = root.join("codex");
        let cmd_shim = root.join("codex.cmd");
        let native_exe = root.join("codex.exe");
        fs::write(&shell_shim, "#!/bin/sh").unwrap();
        fs::write(&cmd_shim, "@echo off").unwrap();
        fs::write(&native_exe, []).unwrap();

        assert_eq!(
            select_discovered([shell_shim, cmd_shim, native_exe.clone()]),
            Some(native_exe)
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn path_discovery_does_not_need_a_shell_process() {
        let root = std::env::temp_dir().join(format!(
            "markitdown-discovery-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        let shim = root.join("opencode.cmd");
        fs::write(&shim, "@echo off").unwrap();

        assert_eq!(
            discover_in_directories("opencode", [root.clone()]),
            Some(shim)
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn cmd_shims_run_without_a_console_window() {
        let root =
            std::env::temp_dir().join(format!("markitdown command test {}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let shim = root.join("agent.cmd");
        fs::write(&shim, "@echo off\r\necho %1").unwrap();

        let output = executable_command(&shim)
            .unwrap()
            .arg("ready")
            .output()
            .unwrap();
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "ready");
        fs::remove_dir_all(root).unwrap();
    }
}
