use super::{
    process,
    types::{AgentChangeSet, AgentFileChange, AgentSession},
};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, path::{Path, PathBuf}};

fn git(workdir: &Path, args: &[&str]) -> Result<String, String> {
    let output = process::system_command("git")
        .args(args)
        .current_dir(workdir)
        .output()
        .map_err(|error| format!("无法启动 Git：{error}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn ensure_git_workspace(root: &Path) -> Result<(), String> {
    if !root.is_dir() {
        return Err("工作区目录不存在".into());
    }
    let top = git(root, &["rev-parse", "--show-toplevel"])?;
    let top = fs::canonicalize(top.trim()).map_err(|error| error.to_string())?;
    let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    if top != root {
        return Err("Agent 工作区必须选择 Git 仓库根目录".into());
    }
    Ok(())
}

fn file_hash(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    if path.is_dir() {
        return Ok(None);
    }
    let data = fs::read(path).map_err(|error| format!("读取 {} 失败：{error}", path.display()))?;
    Ok(Some(hex::encode(Sha256::digest(data))))
}

fn tracked_and_untracked(root: &Path) -> Result<Vec<String>, String> {
    let output = git(root, &["ls-files", "-z", "--cached", "--others", "--exclude-standard"])?;
    Ok(output.split('\0').filter(|item| !item.is_empty()).map(str::to_string).collect())
}

fn copy_untracked(root: &Path, worktree: &Path) -> Result<(), String> {
    let output = git(root, &["ls-files", "-z", "--others", "--exclude-standard"])?;
    for relative in output.split('\0').filter(|item| !item.is_empty()) {
        let source = root.join(relative);
        let target = worktree.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::copy(&source, &target).map_err(|error| format!("复制 {} 失败：{error}", source.display()))?;
    }
    Ok(())
}

pub fn create_isolated_worktree(root: &Path, session_dir: &Path) -> Result<(String, HashMap<String, Option<String>>), String> {
    ensure_git_workspace(root)?;
    if session_dir.exists() {
        return Err("Agent 隔离目录已存在".into());
    }
    fs::create_dir_all(session_dir.parent().ok_or("无效的隔离目录")?).map_err(|error| error.to_string())?;
    let session_arg = session_dir.to_string_lossy().to_string();
    git(root, &["worktree", "add", "--detach", &session_arg, "HEAD"])?;

    let patch = git(root, &["diff", "--binary", "HEAD"])?;
    if !patch.trim().is_empty() {
        let patch_path = session_dir.join(".markitdown-baseline.patch");
        fs::write(&patch_path, patch.as_bytes()).map_err(|error| error.to_string())?;
        let patch_arg = patch_path.to_string_lossy().to_string();
        let apply_result = git(session_dir, &["apply", "--binary", &patch_arg]);
        let _ = fs::remove_file(&patch_path);
        apply_result?;
    }
    copy_untracked(root, session_dir)?;

    let mut baseline_hashes = HashMap::new();
    for relative in tracked_and_untracked(root)? {
        baseline_hashes.insert(relative.clone(), file_hash(&root.join(&relative))?);
    }

    git(session_dir, &["add", "-A"])?;
    git(session_dir, &[
        "-c", "user.name=MarkitDown Agent",
        "-c", "user.email=agent@markitdown.local",
        "commit", "--allow-empty", "-m", "MarkitDown Agent baseline",
    ])?;
    let base_commit = git(session_dir, &["rev-parse", "HEAD"])?.trim().to_string();
    Ok((base_commit, baseline_hashes))
}

fn status_name(code: &str) -> (&'static str, bool) {
    match code.chars().next().unwrap_or('M') {
        'A' | '?' => ("added", false),
        'D' => ("deleted", false),
        'R' => ("renamed", false),
        _ => ("modified", false),
    }
}

pub fn get_changes(session: &AgentSession) -> Result<AgentChangeSet, String> {
    let worktree = Path::new(session.worktree_path.as_deref().ok_or("会话没有隔离工作区")?);
    // The isolated index belongs only to this Agent session. Staging the final
    // tree makes additions, deletions and binary files available to one diff.
    git(worktree, &["add", "-A"])?;
    let status = git(worktree, &["status", "--porcelain=v1", "-z"])?;
    let mut files = Vec::new();
    for entry in status.split('\0').filter(|item| item.len() >= 4) {
        let code = &entry[..2];
        let path = entry[3..].to_string();
        let (mut state, _) = status_name(code);
        let numstat = git(worktree, &["diff", "--cached", "--numstat", "HEAD", "--", &path]).unwrap_or_default();
        let columns: Vec<&str> = numstat.split_whitespace().collect();
        let binary = columns.first().is_some_and(|value| *value == "-");
        if binary { state = "binary"; }
        let additions = columns.first().and_then(|value| value.parse().ok()).unwrap_or(0);
        let deletions = columns.get(1).and_then(|value| value.parse().ok()).unwrap_or(0);
        let diff = if binary { None } else { Some(git(worktree, &["diff", "--cached", "--no-ext-diff", "HEAD", "--", &path]).unwrap_or_default()) };
        files.push(AgentFileChange { path, status: state.into(), additions, deletions, binary, diff });
    }
    Ok(AgentChangeSet { session_id: session.id.clone(), files, base_commit: session.base_commit.clone() })
}

pub fn apply_changes(session: &mut AgentSession, selected: Option<&[String]>) -> Result<(), String> {
    let root = Path::new(&session.workspace_root);
    let worktree = Path::new(session.worktree_path.as_deref().ok_or("会话没有隔离工作区")?);
    let changes = get_changes(session)?;
    let paths: Vec<String> = selected.map(|items| items.to_vec()).unwrap_or_else(|| changes.files.iter().map(|item| item.path.clone()).collect());
    if paths.is_empty() {
        return Ok(());
    }
    for relative in &paths {
        let current = file_hash(&root.join(relative))?;
        let baseline = session.baseline_hashes.get(relative).cloned().unwrap_or(None);
        if current != baseline {
            return Err(format!("文件 {relative} 在 Agent 运行期间发生变化，已停止应用"));
        }
    }

    git(worktree, &["add", "-A"])?;
    let mut args = vec!["diff", "--cached", "--binary", "HEAD", "--"];
    args.extend(paths.iter().map(String::as_str));
    let patch = git(worktree, &args)?;
    if patch.trim().is_empty() {
        return Ok(());
    }
    let patch_path = worktree.join(".markitdown-agent-result.patch");
    fs::write(&patch_path, patch.as_bytes()).map_err(|error| error.to_string())?;
    let patch_arg = patch_path.to_string_lossy().to_string();
    let result = git(root, &["apply", "--binary", "--whitespace=nowarn", &patch_arg]);
    let _ = fs::remove_file(patch_path);
    result?;

    let mut commit_args = vec![
        "-c", "user.name=MarkitDown Agent",
        "-c", "user.email=agent@markitdown.local",
        "commit", "--allow-empty", "--only", "-m", "MarkitDown Agent applied changes", "--",
    ];
    commit_args.extend(paths.iter().map(String::as_str));
    git(worktree, &commit_args)?;
    session.base_commit = git(worktree, &["rev-parse", "HEAD"])?.trim().to_string();
    for relative in paths {
        session.baseline_hashes.insert(relative.clone(), file_hash(&root.join(relative))?);
    }
    Ok(())
}

pub fn remove_worktree(session: &AgentSession) -> Result<(), String> {
    if let Some(path) = &session.worktree_path {
        let root = Path::new(&session.workspace_root);
        git(root, &["worktree", "remove", "--force", path])?;
        let _ = git(root, &["worktree", "prune"]);
    }
    Ok(())
}

pub fn session_worktree_path(storage_root: &Path, session_id: &str) -> PathBuf {
    storage_root.join("worktrees").join(session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::{AgentApprovalMode, AgentBackendId, AgentSessionStatus};

    fn run(root: &Path, args: &[&str]) {
        let output = process::system_command("git").args(args).current_dir(root).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    }

    #[test]
    fn isolated_baseline_preserves_dirty_files_and_applies_only_agent_delta() {
        let parent = std::env::temp_dir().join(format!("markitdown-agent-test-{}", uuid::Uuid::new_v4()));
        let root = parent.join("repo");
        let worktree = parent.join("worktree");
        fs::create_dir_all(&root).unwrap();
        run(&root, &["init"]);
        fs::write(root.join("notes.md"), "committed\n").unwrap();
        run(&root, &["add", "notes.md"]);
        run(&root, &["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"]);

        fs::write(root.join("notes.md"), "user draft\n").unwrap();
        fs::write(root.join("local.md"), "local context\n").unwrap();
        let (base_commit, baseline_hashes) = create_isolated_worktree(&root, &worktree).unwrap();
        assert_eq!(fs::read_to_string(worktree.join("notes.md")).unwrap().replace("\r\n", "\n"), "user draft\n");
        assert_eq!(fs::read_to_string(worktree.join("local.md")).unwrap().replace("\r\n", "\n"), "local context\n");

        fs::write(worktree.join("notes.md"), "user draft\nagent edit\n").unwrap();
        fs::write(worktree.join("created.md"), "agent file\n").unwrap();
        let mut session = AgentSession {
            id: "test".into(), backend: AgentBackendId::Codex,
            workspace_root: root.to_string_lossy().into_owned(), worktree_path: Some(worktree.to_string_lossy().into_owned()),
            backend_session_id: None, status: AgentSessionStatus::Completed, approval_mode: AgentApprovalMode::Tiered,
            created_at: String::new(), updated_at: String::new(), last_error: None, has_changes: true, read_only: false,
            direct_write: false,
            base_commit, baseline_hashes,
        };
        let changes = get_changes(&session).unwrap();
        assert!(changes.files.iter().any(|item| item.path == "notes.md"));
        assert!(changes.files.iter().any(|item| item.path == "created.md" && item.status == "added"));

        apply_changes(&mut session, Some(&["notes.md".into()])).unwrap();
        assert_eq!(fs::read_to_string(root.join("notes.md")).unwrap().replace("\r\n", "\n"), "user draft\nagent edit\n");
        assert!(!root.join("created.md").exists());
        let remaining = get_changes(&session).unwrap();
        assert_eq!(remaining.files.len(), 1);
        assert_eq!(remaining.files[0].path, "created.md");

        apply_changes(&mut session, None).unwrap();
        assert_eq!(fs::read_to_string(root.join("created.md")).unwrap().replace("\r\n", "\n"), "agent file\n");
        assert!(get_changes(&session).unwrap().files.is_empty());
        remove_worktree(&session).unwrap();
        fs::remove_dir_all(parent).unwrap();
    }

    #[test]
    fn refuses_to_apply_when_original_changed_after_session_started() {
        let parent = std::env::temp_dir().join(format!("markitdown-agent-conflict-{}", uuid::Uuid::new_v4()));
        let root = parent.join("repo");
        let worktree = parent.join("worktree");
        fs::create_dir_all(&root).unwrap();
        run(&root, &["init"]);
        fs::write(root.join("notes.md"), "base\n").unwrap();
        run(&root, &["add", "notes.md"]);
        run(&root, &["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"]);
        let (base_commit, baseline_hashes) = create_isolated_worktree(&root, &worktree).unwrap();
        fs::write(worktree.join("notes.md"), "agent\n").unwrap();
        fs::write(root.join("notes.md"), "user changed later\n").unwrap();
        let mut session = AgentSession {
            id: "test".into(), backend: AgentBackendId::ClaudeCode,
            workspace_root: root.to_string_lossy().into_owned(), worktree_path: Some(worktree.to_string_lossy().into_owned()),
            backend_session_id: None, status: AgentSessionStatus::Completed, approval_mode: AgentApprovalMode::Tiered,
            created_at: String::new(), updated_at: String::new(), last_error: None, has_changes: true, read_only: false,
            direct_write: false,
            base_commit, baseline_hashes,
        };
        assert!(apply_changes(&mut session, None).unwrap_err().contains("发生变化"));
        remove_worktree(&session).unwrap();
        fs::remove_dir_all(parent).unwrap();
    }
}
