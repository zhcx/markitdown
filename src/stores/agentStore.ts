import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AgentApprovalDecision,
  AgentApprovalMode,
  AgentApprovalRequest,
  AgentBackendId,
  AgentBackendStatus,
  AgentChangeSet,
  AgentEvent,
  AgentSession,
  AgentTimelineItem,
} from '../types/agent';

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
let eventUnlisten: UnlistenFn | null = null;

interface StartAgentTurnInput {
  backend: AgentBackendId;
  workspaceRoot: string;
  prompt: string;
  executablePath?: string;
  model?: string;
  profile?: string;
  reasoningEffort?: string;
  contextPaths?: string[];
  approvalMode: AgentApprovalMode;
  sessionId?: string;
}

interface AgentState {
  backends: AgentBackendStatus[];
  sessions: AgentSession[];
  activeSessionId: string | null;
  timeline: AgentTimelineItem[];
  pendingApproval: AgentApprovalRequest | null;
  changes: AgentChangeSet | null;
  loading: boolean;
  diagnostic: string;
  initialize: () => Promise<void>;
  detectBackends: (overrides?: Partial<Record<AgentBackendId, string>>) => Promise<void>;
  startTurn: (input: StartAgentTurnInput) => Promise<void>;
  cancelTurn: () => Promise<void>;
  respondApproval: (decision: AgentApprovalDecision) => Promise<void>;
  setApprovalMode: (mode: AgentApprovalMode) => Promise<void>;
  refreshChanges: () => Promise<void>;
  applyChanges: (paths?: string[]) => Promise<void>;
  discardSession: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  newSession: () => void;
}

const appendEvent = (items: AgentTimelineItem[], event: AgentEvent): AgentTimelineItem[] => {
  const last = items[items.length - 1];
  if (event.kind === 'status' && last?.kind === 'status' && last.content.startsWith('连接暂时中断')) {
    return [...items.slice(0, -1), { ...last, content: event.content || '', sequence: event.sequence }];
  }
  if (event.kind === 'message_delta' || event.kind === 'reasoning_delta' || event.kind === 'command_output') {
    if (last && last.kind === event.kind && last.sequence + 1 === event.sequence) {
      return [...items.slice(0, -1), { ...last, content: last.content + (event.content || ''), sequence: event.sequence }];
    }
  }
  return [...items, {
    id: `${event.turn_id}-${event.sequence}`,
    kind: event.kind,
    content: event.content || event.message || '',
    tool_name: event.tool_name,
    sequence: event.sequence,
  }];
};

const errorText = (error: unknown) => String(error).replace(/^Error:\s*/, '');

export const useAgentStore = create<AgentState>((set, get) => ({
  backends: [],
  sessions: [],
  activeSessionId: null,
  timeline: [],
  pendingApproval: null,
  changes: null,
  loading: false,
  diagnostic: '',

  initialize: async () => {
    if (!isTauriRuntime()) {
      set({ diagnostic: 'Agent 仅在桌面版中可用。' });
      return;
    }
    if (!eventUnlisten) {
      eventUnlisten = await listen<AgentEvent>('agent-event', ({ payload }) => {
        const state = get();
        if (state.activeSessionId && payload.session_id !== state.activeSessionId) return;
        const terminal = payload.kind === 'done' || payload.kind === 'error';
        set({
          activeSessionId: state.activeSessionId || payload.session_id,
          timeline: appendEvent(state.timeline, payload),
          pendingApproval: payload.kind === 'approval_requested' ? payload.approval || null
            : payload.kind === 'approval_resolved' ? null : state.pendingApproval,
          loading: terminal ? false : state.loading || payload.kind !== 'approval_resolved',
          diagnostic: payload.kind === 'error' ? payload.content || payload.message || 'Agent 执行失败' : state.diagnostic,
          sessions: state.sessions.map((session) => session.id === payload.session_id ? {
            ...session,
            status: payload.kind === 'done' ? 'completed' : payload.kind === 'error' ? 'error'
              : payload.kind === 'approval_requested' ? 'waiting_approval' : 'running',
          } : session),
        });
        if (payload.kind === 'done') void get().refreshChanges();
      });
    }
    const sessions = await invoke<AgentSession[]>('agent_list_sessions');
    set({ sessions });
  },

  detectBackends: async (overrides = {}) => {
    if (!isTauriRuntime()) return;
    const backends = await invoke<AgentBackendStatus[]>('agent_detect_backends', { overrides });
    set({ backends });
  },

  startTurn: async (input) => {
    const userItem: AgentTimelineItem = {
      id: `user-${Date.now()}`,
      kind: 'user',
      content: input.prompt,
      sequence: 0,
    };
    set((state) => ({
      loading: true,
      diagnostic: '',
      pendingApproval: null,
      changes: null,
      timeline: input.sessionId && state.activeSessionId === input.sessionId
        ? [...state.timeline, userItem]
        : [userItem],
    }));
    try {
      const session = await invoke<AgentSession>('agent_start_turn', { request: {
        backend: input.backend,
        workspace_root: input.workspaceRoot,
        prompt: input.prompt,
        executable_path: input.executablePath || null,
        model: input.model || null,
        profile: input.profile || null,
        reasoning_effort: input.reasoningEffort || null,
        context_paths: input.contextPaths || [],
        approval_mode: input.approvalMode,
        session_id: input.sessionId || null,
      } });
      set((state) => ({
        activeSessionId: session.id,
        sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      }));
    } catch (error) {
      set({ loading: false, diagnostic: errorText(error) });
      try {
        set({ sessions: await invoke<AgentSession[]>('agent_list_sessions') });
      } catch {
        // Keep the original launch diagnostic.
      }
      throw error;
    }
  },

  cancelTurn: async () => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    await invoke('agent_cancel_turn', { sessionId });
  },

  respondApproval: async (decision) => {
    const approval = get().pendingApproval;
    if (!approval) return;
    if (decision === 'allow_all_session') {
      const confirmed = window.confirm('本会话后续的命令、网络、MCP 和目录内编辑将不再逐次询问。当前目录边界和禁止 Git push 等硬性限制仍然生效。');
      if (!confirmed) return;
    }
    await invoke('agent_respond_approval', { sessionId: approval.session_id, approvalId: approval.id, decision });
    set((state) => ({
      pendingApproval: null,
      sessions: state.sessions.map((session) => session.id === approval.session_id ? {
        ...session,
        approval_mode: decision === 'allow_all_session' ? 'allow_all_session' : session.approval_mode,
        status: 'running',
      } : session),
    }));
  },

  setApprovalMode: async (mode) => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    await invoke('agent_set_approval_mode', { sessionId, mode });
    set((state) => ({
      sessions: state.sessions.map((session) => session.id === sessionId ? { ...session, approval_mode: mode } : session),
    }));
  },

  refreshChanges: async () => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    const changes = await invoke<AgentChangeSet>('agent_get_changes', { sessionId });
    set({ changes });
  },

  applyChanges: async (paths) => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    await invoke('agent_apply_changes', { sessionId, paths: paths || null });
    await get().refreshChanges();
  },

  discardSession: async () => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    await invoke('agent_discard_session', { sessionId });
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== sessionId),
      activeSessionId: null,
      timeline: [],
      pendingApproval: null,
      changes: null,
      loading: false,
    }));
  },

  selectSession: async (sessionId) => {
    const events = await invoke<AgentEvent[]>('agent_get_session_events', { sessionId });
    const session = get().sessions.find((item) => item.id === sessionId);
    set({
      activeSessionId: sessionId,
      timeline: events.reduce(appendEvent, [] as AgentTimelineItem[]),
      pendingApproval: null,
      changes: null,
      loading: session?.status === 'running' || session?.status === 'waiting_approval',
    });
    await get().refreshChanges();
  },

  newSession: () => set({ activeSessionId: null, timeline: [], pendingApproval: null, changes: null, diagnostic: '', loading: false }),
}));
