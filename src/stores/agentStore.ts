import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AgentApprovalDecision,
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
  setTieredApproval: () => Promise<void>;
  refreshChanges: () => Promise<void>;
  applyChanges: (paths?: string[]) => Promise<void>;
  discardSession: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  newSession: () => void;
}

const appendEvent = (items: AgentTimelineItem[], event: AgentEvent): AgentTimelineItem[] => {
  if (event.kind === 'message_delta' || event.kind === 'reasoning_delta' || event.kind === 'command_output') {
    const last = items[items.length - 1];
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
        set({
          activeSessionId: state.activeSessionId || payload.session_id,
          timeline: appendEvent(state.timeline, payload),
          pendingApproval: payload.kind === 'approval_requested' ? payload.approval || null
            : payload.kind === 'approval_resolved' ? null : state.pendingApproval,
          loading: !['done', 'error'].includes(payload.kind),
          diagnostic: payload.kind === 'error' ? payload.message || 'Agent 执行失败' : state.diagnostic,
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
    set({ loading: true, diagnostic: '', pendingApproval: null, changes: null });
    const session = await invoke<AgentSession>('agent_start_turn', { request: {
      backend: input.backend,
      workspace_root: input.workspaceRoot,
      prompt: input.prompt,
      executable_path: input.executablePath || null,
      model: input.model || null,
      profile: input.profile || null,
      session_id: input.sessionId || null,
    } });
    set((state) => ({
      activeSessionId: session.id,
      sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      timeline: state.activeSessionId === session.id && state.timeline.length > 0
        ? [{ id: `user-${Date.now()}`, kind: 'user', content: input.prompt, sequence: 0 }, ...state.timeline]
        : [{ id: `user-${Date.now()}`, kind: 'user', content: input.prompt, sequence: 0 }],
    }));
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
      const confirmed = window.confirm('本会话后续的命令、网络、MCP 和隔离区编辑将不再逐次询问。隔离工作区和禁止推送等硬边界仍然生效。');
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

  setTieredApproval: async () => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    await invoke('agent_set_approval_mode', { sessionId, mode: 'tiered' });
    set((state) => ({ sessions: state.sessions.map((session) => session.id === sessionId ? { ...session, approval_mode: 'tiered' } : session) }));
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
    set({
      activeSessionId: sessionId,
      timeline: events.reduce(appendEvent, [] as AgentTimelineItem[]),
      pendingApproval: null,
      changes: null,
    });
    await get().refreshChanges();
  },

  newSession: () => set({ activeSessionId: null, timeline: [], pendingApproval: null, changes: null, diagnostic: '', loading: false }),
}));
