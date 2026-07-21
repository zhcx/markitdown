import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useAgentStore } from '../../stores/agentStore';
import type { AgentBackendId } from '../../types/agent';
import { readStoredStringArray } from '../../utils/storage';

const BACKEND_LABELS: Record<AgentBackendId, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
};

interface AgentPanelProps {
  onRuntimeChange: (runtime: 'api' | 'agent') => void;
}

export function AgentPanel({ onRuntimeChange }: AgentPanelProps) {
  const { settings } = useAppStore();
  const {
    backends, sessions, activeSessionId, timeline, pendingApproval, changes, loading, diagnostic,
    initialize, detectBackends, startTurn, cancelTurn, respondApproval, setTieredApproval,
    refreshChanges, applyChanges, discardSession, selectSession, newSession,
  } = useAgentStore();
  const [backend, setBackend] = useState<AgentBackendId>(settings.agent.backend);
  const [prompt, setPrompt] = useState('');
  const [selection, setSelection] = useState<{ key: string; excluded: string[] }>({ key: '', excluded: [] });
  const roots = useMemo(() => readStoredStringArray('markitdown.workspace-roots'), []);
  const workspaceRoot = roots[0] || '';
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const backendConfig = settings.agent.backends[backend];
  const backendStatus = backends.find((item) => item.id === backend);
  const changeKey = changes?.files.map((file) => `${file.status}:${file.path}`).join('|') || '';
  const excludedPaths = selection.key === changeKey ? selection.excluded : [];
  const selectedPaths = changes?.files
    .map((file) => file.path)
    .filter((path) => !excludedPaths.includes(path)) || [];

  useEffect(() => {
    void initialize();
    const overrides = Object.fromEntries(Object.entries(settings.agent.backends)
      .filter(([, config]) => config.executable_path.trim())
      .map(([id, config]) => [id, config.executable_path])) as Partial<Record<AgentBackendId, string>>;
    void detectBackends(overrides);
  }, [detectBackends, initialize, settings.agent.backends]);

  const submit = async () => {
    const text = prompt.trim();
    if (!text || !workspaceRoot || loading || !backendStatus?.compatible) return;
    setPrompt('');
    try {
      await startTurn({
        backend,
        workspaceRoot,
        prompt: text,
        executablePath: backendConfig.executable_path,
        model: backendConfig.model,
        profile: backendConfig.profile,
        sessionId: activeSession?.backend === backend ? activeSession.id : undefined,
      });
    } catch (error) {
      setPrompt(text);
      window.alert(String(error));
    }
  };

  if (!settings.agent.enabled) {
    return (
      <div className="agent-panel agent-disabled">
        <RuntimeTabs active="agent" onChange={onRuntimeChange} />
        <div className="agent-empty-state">
          <strong>Agent Beta 尚未启用</strong>
          <span>在“设置 → AI 助手”中启用本地 Agent。</span>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-panel">
      <div className="agent-header">
        <RuntimeTabs active="agent" onChange={onRuntimeChange} />
        <div className="agent-controls">
          <select value={backend} onChange={(event) => { setBackend(event.target.value as AgentBackendId); newSession(); }} aria-label="Agent backend">
            {(Object.keys(BACKEND_LABELS) as AgentBackendId[]).map((id) => (
              <option key={id} value={id}>{BACKEND_LABELS[id]}</option>
            ))}
          </select>
          <select
            value={activeSessionId || ''}
            onChange={(event) => event.target.value ? void selectSession(event.target.value) : newSession()}
            aria-label="Agent 会话"
          >
            <option value="">新会话</option>
            {sessions.filter((session) => session.workspace_root === workspaceRoot).map((session) => (
              <option key={session.id} value={session.id}>{BACKEND_LABELS[session.backend]} · {new Date(session.updated_at).toLocaleString()}</option>
            ))}
          </select>
        </div>
        <div className={`agent-health ${backendStatus?.compatible ? 'ready' : 'unavailable'}`}>
          <span aria-hidden="true" />
          {backendStatus?.compatible
            ? `${backendStatus.version || '已发现'} · ${activeSession ? (activeSession.direct_write ? '当前目录已授权' : '隔离工作区') : '当前目录待授权'}`
            : backendStatus?.diagnostic || '正在检测运行环境'}
        </div>
      </div>

      <div className="agent-timeline">
        {!workspaceRoot && <div className="agent-empty-state"><strong>请先打开工作区</strong><span>Agent 将使用打开的当前目录作为会话授权范围。</span></div>}
        {workspaceRoot && timeline.length === 0 && (
          <div className="agent-empty-state"><strong>让 Agent 在当前目录中处理任务</strong><span>Git 根目录使用隔离工作区；其他目录在当前授权范围内直接写入。</span></div>
        )}
        {timeline.map((item) => (
          <article key={item.id} className={`agent-event agent-event-${item.kind}`}>
            <header>{item.kind === 'user' ? '你' : item.tool_name || eventLabel(item.kind)}</header>
            {item.content && <pre>{item.content}</pre>}
          </article>
        ))}
        {pendingApproval && (
          <section className="agent-approval-card">
            <div><strong>{pendingApproval.title}</strong><span>{pendingApproval.detail}</span></div>
            {pendingApproval.command && <code>{pendingApproval.command}</code>}
            <div className="agent-approval-actions">
              <button onClick={() => void respondApproval('deny')}>拒绝</button>
              <button onClick={() => void respondApproval('allow_once')}>本次允许</button>
              <button onClick={() => void respondApproval('allow_session_kind')}>本会话同类允许</button>
              <button className="primary" onClick={() => void respondApproval('allow_all_session')}>本会话完全允许</button>
            </div>
          </section>
        )}
        {diagnostic && <div className="agent-diagnostic">{diagnostic}</div>}
      </div>

      {activeSession?.approval_mode === 'allow_all_session' && (
        <div className="agent-unrestricted-banner">
          <span>当前会话已完全允许，目录边界和禁止推送规则仍然有效。</span>
          <button onClick={() => void setTieredApproval()}>恢复分级审批</button>
        </div>
      )}

      {activeSession?.read_only && (
        <div className="agent-readonly-banner">当前目录不是 Git 仓库，本会话仅允许读取和分析。</div>
      )}

      {activeSession?.direct_write && (
        <div className="agent-direct-write-banner">当前目录已授权，Agent 修改会直接写入，不经过隔离审阅。</div>
      )}

      {changes && changes.files.length > 0 && (
        <section className="agent-changes">
          <header><strong>待应用变更</strong><button onClick={() => void refreshChanges()}>刷新</button></header>
          <div className="agent-change-list">
            {changes.files.map((file) => (
              <label key={file.path}>
                <input
                  type="checkbox"
                  checked={selectedPaths.includes(file.path)}
                  onChange={(event) => setSelection({
                    key: changeKey,
                    excluded: event.target.checked
                      ? excludedPaths.filter((path) => path !== file.path)
                      : [...excludedPaths, file.path],
                  })}
                />
                <span className={`agent-change-status ${file.status}`}>{file.status}</span>
                <span>{file.path}</span>
                {!file.binary && <small>+{file.additions} −{file.deletions}</small>}
              </label>
            ))}
          </div>
          <footer>
            <button onClick={() => void discardSession()}>丢弃会话</button>
            <button className="primary" disabled={selectedPaths.length === 0} onClick={() => void applyChanges(selectedPaths)}>应用所选文件</button>
          </footer>
        </section>
      )}

      <div className="agent-composer">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
          }}
          placeholder="描述需要 Agent 完成的任务…"
          disabled={!workspaceRoot || !backendStatus?.compatible}
        />
        <button
          className="agent-send-button"
          onClick={loading ? () => void cancelTurn() : () => void submit()}
          disabled={!loading && (!prompt.trim() || !workspaceRoot || !backendStatus?.compatible)}
          title={loading ? '停止任务' : '发送任务'}
          aria-label={loading ? '停止任务' : '发送任务'}
        >
          {loading ? (
            <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="8" height="8" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.4 9.3 16 3.8l-4.9 12.4-1.7-5.4-6-1.5Z" /><path d="m9.4 10.8 3.2-3.2" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}

export function RuntimeTabs({ active, onChange }: { active: 'api' | 'agent'; onChange: (runtime: 'api' | 'agent') => void }) {
  return (
    <div className="ai-runtime-tabs" role="tablist" aria-label="AI 运行模式">
      <button className={active === 'api' ? 'active' : ''} onClick={() => onChange('api')} role="tab" aria-selected={active === 'api'}>AI 对话</button>
      <button className={active === 'agent' ? 'active' : ''} onClick={() => onChange('agent')} role="tab" aria-selected={active === 'agent'}>Agent <small>Beta</small></button>
    </div>
  );
}

function eventLabel(kind: string) {
  if (kind === 'reasoning_delta') return '思考';
  if (kind === 'command_output') return '终端';
  if (kind === 'tool_started') return '工具';
  if (kind === 'tool_completed') return '工具完成';
  if (kind === 'error') return '错误';
  if (kind === 'done') return '完成';
  return 'Agent';
}
