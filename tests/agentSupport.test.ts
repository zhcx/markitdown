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
  assert.match(agentStore, /window\.confirm\('本会话后续/);
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
