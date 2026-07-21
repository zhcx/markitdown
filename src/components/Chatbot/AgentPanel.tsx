import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/appStore';
import { useAgentStore } from '../../stores/agentStore';
import type { AgentApprovalMode, AgentBackendId, AgentTimelineItem } from '../../types/agent';
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
    initialize, detectBackends, startTurn, cancelTurn, respondApproval, setApprovalMode,
    refreshChanges, applyChanges, discardSession, selectSession, newSession,
  } = useAgentStore();
  const [backend, setBackend] = useState<AgentBackendId>(settings.agent.backend);
  const [prompt, setPrompt] = useState('');
  const [approvalMode, setLocalApprovalMode] = useState<AgentApprovalMode>('tiered');
  const [model, setModel] = useState(settings.agent.backends[settings.agent.backend].model);
  const [profile, setProfile] = useState(settings.agent.backends[settings.agent.backend].profile);
  const [reasoningEffort, setReasoningEffort] = useState(settings.agent.backends[settings.agent.backend].reasoning_effort);
  const [contextPaths, setContextPaths] = useState<string[]>([]);
  const [showRuntimeOptions, setShowRuntimeOptions] = useState(false);
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

  useEffect(() => {
    setModel(backendConfig.model);
    setProfile(backendConfig.profile);
    setReasoningEffort(backendConfig.reasoning_effort);
    setContextPaths([]);
    setShowRuntimeOptions(false);
  }, [backend, backendConfig.model, backendConfig.profile, backendConfig.reasoning_effort]);

  useEffect(() => {
    if (activeSession) setLocalApprovalMode(activeSession.approval_mode);
  }, [activeSession]);

  const chooseContextFiles = async () => {
    if (!workspaceRoot || loading) return;
    const selected = await open({ multiple: true, directory: false, defaultPath: workspaceRoot });
    const paths = typeof selected === 'string' ? [selected] : selected || [];
    setContextPaths((current) => [...new Set([...current, ...paths])]);
  };

  const changeApprovalMode = async (mode: AgentApprovalMode) => {
    if (mode === 'allow_all_session') {
      const confirmed = window.confirm('本会话后续的命令、网络、MCP 和目录内编辑将不再逐次询问。当前目录边界和禁止 Git push 等硬性限制仍然生效。');
      if (!confirmed) return;
    }
    setLocalApprovalMode(mode);
    if (activeSession) await setApprovalMode(mode);
  };

  const submit = async () => {
    const text = prompt.trim();
    if (!text || !workspaceRoot || loading || !backendStatus?.compatible) return;
    try {
      await startTurn({
        backend,
        workspaceRoot,
        prompt: text,
        executablePath: backendConfig.executable_path,
        model,
        profile,
        reasoningEffort,
        contextPaths,
        approvalMode,
        sessionId: activeSession?.backend === backend ? activeSession.id : undefined,
      });
      setPrompt('');
      setContextPaths([]);
    } catch {
      // The store exposes a stable diagnostic in the panel.
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
          <div className="agent-empty-state"><strong>让 Agent 在当前目录中处理任务</strong><span>Git 根目录使用隔离工作区，其他目录在当前授权范围内直接写入。</span></div>
        )}
        {buildTimelineBlocks(timeline).map((block) => block.type === 'activity' ? (
          <AgentActivity key={block.id} items={block.items} />
        ) : (
          <article key={block.item.id} className={`agent-message agent-message-${block.item.kind}`}>
            {block.item.kind === 'user' && <header>你</header>}
            {block.item.content && <div className="agent-message-content">{block.item.content}</div>}
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
        {contextPaths.length > 0 && (
          <div className="agent-context-files">
            {contextPaths.map((path) => (
              <span key={path} title={path}>{fileName(path)}<button onClick={() => setContextPaths((items) => items.filter((item) => item !== path))} aria-label={`移除 ${fileName(path)}`}>×</button></span>
            ))}
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
          }}
          placeholder={activeSessionId ? '提出后续变更要求' : '描述需要 Agent 完成的任务'}
          disabled={!workspaceRoot || !backendStatus?.compatible}
        />
        {showRuntimeOptions && (
          <div className="agent-runtime-options">
            <label><span>模型</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="使用 CLI 默认模型" /></label>
            {backendStatus?.capabilities.profile_override && (
              <label><span>{backend === 'claude_code' ? 'Agent' : backend === 'codex' ? 'Profile' : 'Agent 模式'}</span><input value={profile} onChange={(event) => setProfile(event.target.value)} placeholder="使用 CLI 默认配置" /></label>
            )}
          </div>
        )}
        <div className="agent-composer-toolbar">
          <button className="agent-icon-button" onClick={() => void chooseContextFiles()} disabled={!workspaceRoot || loading} title="添加当前目录中的文件" aria-label="添加文件">+</button>
          <select
            className={`agent-permission-select ${approvalMode === 'allow_all_session' ? 'unrestricted' : ''}`}
            value={approvalMode}
            onChange={(event) => void changeApprovalMode(event.target.value as AgentApprovalMode)}
            disabled={loading}
            aria-label="审批模式"
          >
            <option value="tiered">分级审批</option>
            <option value="allow_all_session">完全访问</option>
          </select>
          <span className="agent-composer-spacer" />
          <button className="agent-runtime-button" onClick={() => setShowRuntimeOptions((value) => !value)} title="模型和 Agent 配置">{model || '默认模型'}</button>
          {backendStatus?.capabilities.reasoning_effort && (
            <select className="agent-effort-select" value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value)} disabled={loading} aria-label="推理强度">
              <option value="">自动</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="xhigh">超高</option>
              {backend === 'claude_code' && <option value="max">最大</option>}
            </select>
          )}
          <button
            className="agent-send-button"
            onClick={loading ? () => void cancelTurn() : () => void submit()}
            disabled={!loading && (!prompt.trim() || !workspaceRoot || !backendStatus?.compatible)}
            title={loading ? '停止任务' : '发送任务'}
            aria-label={loading ? '停止任务' : '发送任务'}
          >
            {loading ? '■' : '↑'}
          </button>
        </div>
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
  if (kind === 'status') return '状态';
  if (kind === 'error') return '错误';
  if (kind === 'done') return '完成';
  return 'Agent';
}

function toolLabel(tool: string) {
  const labels: Record<string, string> = {
    commandExecution: '终端',
    fileChange: '文件修改',
    webSearch: '网页搜索',
    mcpToolCall: 'MCP 工具',
  };
  return labels[tool] || tool;
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

const ACTIVITY_KINDS = new Set(['reasoning_delta', 'status', 'tool_started', 'tool_completed', 'command_output', 'usage', 'file_changed']);

type TimelineBlock =
  | { type: 'message'; item: AgentTimelineItem }
  | { type: 'activity'; id: string; items: AgentTimelineItem[] };

function buildTimelineBlocks(items: AgentTimelineItem[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  for (const item of items) {
    if (!ACTIVITY_KINDS.has(item.kind)) {
      if (item.kind !== 'done' || item.content) blocks.push({ type: 'message', item });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.type === 'activity') {
      last.items.push(item);
    } else {
      blocks.push({ type: 'activity', id: `activity-${item.id}`, items: [item] });
    }
  }
  return blocks;
}

function AgentActivity({ items }: { items: AgentTimelineItem[] }) {
  const visibleItems = items.filter((item) => item.kind !== 'tool_completed' || item.content);
  const toolStarts = items.filter((item) => item.kind === 'tool_started');
  const commandCount = toolStarts.filter((item) => item.tool_name === 'commandExecution' || item.tool_name === 'command').length;
  const hasCommands = commandCount > 0 || items.some((item) => item.kind === 'command_output');
  const hasReasoning = items.some((item) => item.kind === 'reasoning_delta');
  const hasTools = toolStarts.length > 0;
  const statusOnly = items.every((item) => item.kind === 'status');

  if (statusOnly && items.length === 1) {
    return <div className="agent-activity-status"><span aria-hidden="true">·</span>{items[0].content}</div>;
  }

  let summary = '活动详情';
  if (hasCommands || hasTools) {
    const count = Math.max(toolStarts.length, commandCount, 1);
    summary = count > 1 ? `运行了 ${count} 个操作` : hasCommands ? '运行命令' : '使用工具';
  } else if (hasReasoning) {
    summary = '思考过程';
  }

  return (
    <details className="agent-activity">
      <summary><span className="agent-activity-icon" aria-hidden="true">›</span>{summary}</summary>
      <div className="agent-activity-content">
        {visibleItems.map((item) => (
          <section key={item.id} className={`agent-activity-${item.kind}`}>
            <header>{item.tool_name ? toolLabel(item.tool_name) : eventLabel(item.kind)}</header>
            {item.content && <pre>{item.content}</pre>}
          </section>
        ))}
      </div>
    </details>
  );
}
