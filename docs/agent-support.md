# Local Agent Beta

MarkitDown Desktop can run Claude Code, Codex, or OpenCode from the AI side panel. This is separate from the API-based AI features: translation, proofreading, companion writing, and ordinary AI chat continue to use the provider configured in AI Settings.

## Requirements

- Install and sign in to at least one supported CLI: `claude`, `codex`, or `opencode`.
- Open the root of a Git repository as the MarkitDown workspace.
- Enable **Local Agent (Beta)** under **Settings → AI Assistant**, then run environment detection.
- Leave executable, model, and profile fields empty to reuse the CLI defaults.

MarkitDown checks for the structured streaming and approval interfaces it needs. A CLI that is installed but too old is reported as incompatible instead of being launched with reduced safety.

## Isolation and applying changes

Each new Agent session creates a detached temporary Git worktree. Current tracked edits and untracked files are copied into a private baseline commit, so the Agent sees the user's current workspace without mixing those edits into the Agent result.

At the end of a turn, MarkitDown compares the worktree with that baseline. Changes can be applied by file. Before applying, MarkitDown checks that the corresponding original files have not changed since the session started. A conflict stops the operation without overwriting the newer content.

Applied files are removed from the pending change set. Discarding a session removes its temporary worktree and local event history. Git repository roots use this isolated review flow. Other opened directories are authorized as the session root and edited directly, while external paths and Git push remain blocked.

## Approval modes

Tiered approval is the default:

- Reads inside the isolated workspace and file edits inside the worktree are allowed.
- Shell commands, network access, and MCP tools ask for approval.
- External paths and `git push` are blocked.

An approval card offers one-time approval, approval for the same action type during the session, complete approval for the current session, or rejection. Complete approval auto-accepts later command, network, and MCP requests, but does not remove worktree isolation or hard-deny rules.

Complete approval exists only in memory. Restarting MarkitDown, creating a new session, or restoring a previous session returns to tiered approval. It can also be disabled immediately from the Agent panel; operations already running are not retroactively interrupted.

## Local data

Session metadata, normalized events, and unapplied worktrees are stored below MarkitDown's application data directory. CLI authentication remains owned by the CLI. MarkitDown does not inject API keys from its ordinary AI provider settings into Agent processes.
