import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps API AI and local Agent settings in separate compatibility domains', () => {
  const store = read('src/stores/appStore.ts');
  assert.match(store, /agent:\s*\{\s*enabled:\s*false/);
  assert.match(store, /ai:\s*\{\s*enabled:\s*false/);
  assert.match(store, /backends:\s*\{[\s\S]*claude_code:[\s\S]*codex:[\s\S]*opencode:/);
  assert.match(store, /saved\.agent\?\.backends/);
});

test('exposes session-scoped full approval without persisting it in settings', () => {
  const types = read('src/types/agent.ts');
  const agentStore = read('src/stores/agentStore.ts');
  const rust = read('src-tauri/src/agent/mod.rs');
  assert.match(types, /AgentApprovalMode = 'tiered' \| 'allow_all_session'/);
  assert.match(agentStore, /window\.confirm\(`本会话后续/);
  assert.match(rust, /persisted_session\.approval_mode = AgentApprovalMode::Tiered/);
  assert.match(rust, /git push/);
});

test('routes all desktop Agent traffic through a unified Tauri event', () => {
  const store = read('src/stores/agentStore.ts');
  const rust = read('src-tauri/src/agent/mod.rs');
  assert.match(store, /listen<AgentEvent>\('agent-event'/);
  assert.match(rust, /app\.emit\("agent-event"/);
  assert.match(rust, /agent_start_turn/);
  assert.match(rust, /agent_apply_changes/);
  assert.match(rust, /agent_discard_session/);
});

test('discovers Agent CLIs without spawning probes when the panel opens', () => {
  const rust = read('src-tauri/src/agent/mod.rs');
  const process = read('src-tauri/src/agent/process.rs');
  assert.match(rust, /fn discover_executable\(name: &str\)[\s\S]*process::discover_executable\(name\)/);
  assert.match(process, /std::env::split_paths/);
  assert.doesNotMatch(rust.match(/pub async fn agent_detect_backends[\s\S]*?\n\}/)?.[0] || '', /executable_version|probe_capabilities/);
});

test('non-Git Agent sessions authorize the current directory for direct writes', () => {
  const types = read('src/types/agent.ts');
  const panel = read('src/components/Chatbot/AgentPanel.tsx');
  const rust = read('src-tauri/src/agent/mod.rs');
  assert.match(types, /direct_write: boolean/);
  assert.match(panel, /当前目录已授权，Agent 修改会直接写入/);
  assert.match(rust, /read_only: false,[\s\S]*direct_write/);
});
