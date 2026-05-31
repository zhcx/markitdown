import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from './appStore';

export interface ProofreadResult {
  from: number;
  to: number;
  original: string;
  suggestion: string;
  type: 'spelling' | 'grammar' | 'punctuation' | 'style' | 'markdown' | 'layout';
  explanation: string;
}

function formatError(error: unknown): string {
  const errorMsg = String(error);
  if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
    return '请求超时，请检查网络连接或稍后重试';
  }
  if (errorMsg.includes('connection') || errorMsg.includes('网络')) {
    return '网络连接失败，请检查网络设置';
  }
  if (errorMsg.includes('429') || errorMsg.includes('too many requests')) {
    return 'API请求过于频繁，请稍后重试';
  }
  if (errorMsg.includes('502') || errorMsg.includes('503') || errorMsg.includes('504')) {
    return 'AI服务暂时不可用，请稍后重试';
  }
  if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
    return 'API密钥无效，请检查设置';
  }
  if (errorMsg.includes('解析校对结果失败') || errorMsg.includes('JSON')) {
    return 'AI返回格式异常，正在重试...';
  }
  // 截断过长的错误信息
  if (errorMsg.length > 200) {
    return errorMsg.substring(0, 200) + '...';
  }
  return errorMsg;
}

// Invoke wrapper with timeout so slow AI providers do not leave the UI hanging.
function invokeWithTimeout<T>(cmd: string, args: Record<string, unknown>, timeoutMs: number = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('请求超时，请检查网络连接或稍后重试'));
    }, timeoutMs);

    invoke<T>(cmd, args)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export interface CompanionSuggestion {
  text: string;
  style: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: ChatMessageAttachment[];
  reasoning?: string;
}

export interface ChatMessageAttachment {
  type: 'image' | 'text' | 'file';
  name: string;
  dataUrl?: string;
  content?: string;
}

export type ReasoningEffort = 'off' | 'fast' | 'balanced' | 'deep';

export type AIStatus = 'idle' | 'loading' | 'proofreading' | 'companion' | 'success' | 'error';

// 校对重试配置
const PROOFREAD_MAX_RETRIES = 2;
const PROOFREAD_RETRY_DELAY_MS = 1000;

let companionRequestSeq = 0;
const companionCache = new Map<string, string[]>();
const MAX_COMPANION_CACHE_SIZE = 20;

function normalizeCompanionSuggestions(input: unknown): string[] {
  const collectRawSuggestions = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(collectRawSuggestions);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return ['suggestions', 'data', 'items', 'results', 'text', 'content']
        .flatMap(key => collectRawSuggestions(record[key]));
    }
    return [];
  };

  const rawSuggestions = collectRawSuggestions(input);

  return rawSuggestions
    .flatMap((item) => {
      const trimmed = item.trim();
      if (!trimmed) return [];

      const lines = trimmed
        .split(/\r?\n+/)
        .map(line => line.replace(/^\s*(?:[-*]|\d+[.)]|[一二三四五六七八九十]+[、.])\s*/, '').trim())
        .filter(Boolean);

      return lines.length > 1 ? lines : [trimmed];
    })
    .filter((suggestion, index, suggestions) => suggestions.indexOf(suggestion) === index)
    .slice(0, 5);
}

function getCompanionCacheKey(content: string): string {
  const settings = useAppStore.getState().settings.ai;
  return [
    settings.provider,
    settings.api_endpoint,
    settings.model,
    settings.writing_style,
    settings.custom_style_prompt,
    content,
  ].join('\n---\n');
}

function cacheCompanionSuggestions(key: string, suggestions: string[]) {
  if (suggestions.length === 0) return;
  companionCache.delete(key);
  companionCache.set(key, suggestions);

  while (companionCache.size > MAX_COMPANION_CACHE_SIZE) {
    const oldestKey = companionCache.keys().next().value;
    if (!oldestKey) break;
    companionCache.delete(oldestKey);
  }
}

interface AIState {
  status: AIStatus;
  statusMessage: string;

  // 校对结果
  proofreadResults: ProofreadResult[];
  errorCount: number;
  proofreadPanelVisible: boolean;

  // 伴写
  companionVisible: boolean;
  companionPosition: { x: number; y: number } | null;
  companionSuggestions: string[];
  currentStyle: 'formal' | 'casual' | 'academic' | 'creative' | 'custom';

  // 翻译
  translationVisible: boolean;
  translationPosition: { x: number; y: number } | null;
  translationOriginal: string;
  translationResult: string;

  // 聊天
  chatbotVisible: boolean;
  chatbotMessages: ChatMessage[];
  chatbotLoading: boolean;
  chatbotStreamingPhase: 'reasoning' | 'content' | null;
  reasoningEffort: ReasoningEffort;
  linkedDocument: { title: string; content: string } | null;

  // 操作
  setStatus: (status: AIStatus, message?: string) => void;
  checkProofread: (content: string, baseOffset?: number) => Promise<void>;
  getCompanionSuggestion: (content: string, context?: string) => Promise<void>;
  rewriteSelection: (text: string) => Promise<string>;
  translateText: (text: string, targetLang?: string) => Promise<string>;
  summarizeText: (content: string) => Promise<string>;
  generateOutline: (content: string) => Promise<string>;

  // UI控制
  setProofreadPanelVisible: (visible: boolean) => void;
  setChatbotVisible: (visible: boolean) => void;
  toggleChatbot: () => void;
  sendChatMessage: (content: string, attachments?: ChatMessageAttachment[]) => Promise<void>;
  clearChatHistory: () => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  toggleLinkDocument: () => void;
  setLinkedDocument: (doc: { title: string; content: string } | null) => void;
  setCompanionVisible: (visible: boolean, position?: { x: number; y: number }) => void;
  setCurrentStyle: (style: 'formal' | 'casual' | 'academic' | 'creative' | 'custom') => void;
  setTranslationVisible: (visible: boolean, position?: { x: number; y: number }, original?: string, result?: string) => void;
  applySuggestion: (suggestion: string) => void;
  applyProofreadFix: (result: ProofreadResult) => void;
  ignoreProofreadResult: (result: ProofreadResult) => void;
  clearResults: () => void;
}

export const useAIStore = create<AIState>((set, get) => ({
  status: 'idle',
  statusMessage: '',
  proofreadResults: [],
  errorCount: 0,
  proofreadPanelVisible: false,
  companionVisible: false,
  companionPosition: null,
  companionSuggestions: [],
  currentStyle: 'formal',
  translationVisible: false,
  translationPosition: null,
  translationOriginal: '',
  translationResult: '',
  chatbotVisible: false,
  chatbotMessages: [],
  chatbotLoading: false,
  chatbotStreamingPhase: null,
  reasoningEffort: 'balanced',
  linkedDocument: null,

  setStatus: (status, message = '') => {
    set({ status, statusMessage: message });
  },

  checkProofread: async (content, baseOffset = 0) => {
    const settings = useAppStore.getState().settings;

    if (!settings.ai.enabled) {
      set({ status: 'error', statusMessage: 'AI功能未启用' });
      return;
    }

    if (!settings.ai.api_key) {
      set({ status: 'error', statusMessage: '请先配置API密钥' });
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      set({ status: 'idle', statusMessage: '' });
      return;
    }

    const trimStartOffset = content.indexOf(trimmedContent);
    const resultOffset = baseOffset + Math.max(0, trimStartOffset);

    set({
      status: 'proofreading',
      statusMessage: baseOffset > 0 ? '正在校对选中文本...' : '正在校对全文...',
    });

    // 带重试的校对请求
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= PROOFREAD_MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          set({ statusMessage: `校对重试中 (${attempt}/${PROOFREAD_MAX_RETRIES})...` });
          await new Promise(resolve => setTimeout(resolve, PROOFREAD_RETRY_DELAY_MS));
        }

        const requestData = {
          action: 'proofread',
          content: trimmedContent,
          settings: settings.ai,
        };

        const response = await invokeWithTimeout<{
          success: boolean;
          data: ProofreadResult[];
          message?: string;
        }>('ai_request', requestData, 300000);

        if (response.success) {
          const results = Array.isArray(response.data)
            ? response.data.map(result => ({
                ...result,
                from: result.from + resultOffset,
                to: result.to + resultOffset,
              }))
            : [];
          set({
            status: 'success',
            statusMessage: results.length > 0 ? `发现 ${results.length} 处问题` : '校对完成，未发现问题',
            proofreadResults: results,
            errorCount: results.length,
            proofreadPanelVisible: results.length > 0,
          });
          return; // 成功，退出重试循环
        } else {
          // API返回失败（非网络错误），不再重试
          set({ status: 'error', statusMessage: response.message || '校对失败' });
          return;
        }
      } catch (error) {
        lastError = error;
        console.error(`AI proofreading failed (attempt ${attempt + 1}):`, error);

        // 判断是否为可重试的错误（网络/超时相关）
        const errorMsg = String(error).toLowerCase();
        const isRetryable = ['timeout', 'timed out', 'connection', 'network', 'reset', 'closed', '429', '502', '503', '504'].some(
          pattern => errorMsg.includes(pattern)
        );

        if (isRetryable && attempt < PROOFREAD_MAX_RETRIES) {
          continue; // 继续重试
        }

        // 不可重试或已达最大重试次数
        set({ status: 'error', statusMessage: formatError(error) });
        return;
      }
    }

    // 所有重试都失败
    if (lastError) {
      set({ status: 'error', statusMessage: `校对失败（已重试${PROOFREAD_MAX_RETRIES}次）: ${formatError(lastError)}` });
    }
  },

  getCompanionSuggestion: async (content, context) => {
    const requestSeq = ++companionRequestSeq;
    const settings = useAppStore.getState().settings;
    console.log('伴写设置:', settings.ai);

    if (!settings.ai.enabled) {
      set({ status: 'error', statusMessage: 'AI功能未启用', companionSuggestions: [] });
      return;
    }

    if (!settings.ai.api_key) {
      set({ status: 'error', statusMessage: '请先配置API密钥', companionSuggestions: [] });
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      set({ status: 'idle', statusMessage: '', companionSuggestions: [] });
      return;
    }

    const cacheKey = getCompanionCacheKey(trimmedContent);
    const cachedSuggestions = companionCache.get(cacheKey);
    if (cachedSuggestions) {
      set({
        status: 'success',
        statusMessage: '',
        companionSuggestions: cachedSuggestions,
        companionVisible: true,
      });
      return;
    }

    set({
      status: 'companion',
      statusMessage: '正在生成伴写建议...',
      companionSuggestions: [],
    });

    try {
      const requestData = {
        action: 'companion',
        content: trimmedContent,
        context: context || undefined,
        settings: settings.ai,
      };
      console.log('发送伴写请求:', requestData);

      const response = await invokeWithTimeout<{
        success: boolean;
        data: { suggestions: string[] };
        message?: string;
      }>('ai_request', requestData, 60000);
      if (requestSeq !== companionRequestSeq) return;

      if (response.success && response.data?.suggestions) {
        const suggestions = normalizeCompanionSuggestions(response.data.suggestions);
        cacheCompanionSuggestions(cacheKey, suggestions);

        set({
          status: suggestions.length > 0 ? 'success' : 'error',
          statusMessage: suggestions.length > 0 ? '' : 'AI未返回可用续写，请刷新重试',
          companionSuggestions: suggestions,
          companionVisible: true,
        });
      } else {
        set({ status: 'error', statusMessage: response.message || '生成建议失败' });
      }
    } catch (error) {
      console.error('伴写错误:', error);
      if (requestSeq !== companionRequestSeq) return;
      set({ status: 'error', statusMessage: formatError(error) });
    }
  },

  rewriteSelection: async (text) => {
    const settings = useAppStore.getState().settings;
    console.log('重写设置:', settings.ai);

    if (!settings.ai.enabled) {
      console.log('AI功能未启用');
      return text;
    }

    if (!settings.ai.api_key) {
      set({ status: 'error', statusMessage: '请先配置API密钥' });
      return text;
    }

    set({ status: 'loading', statusMessage: '正在重写...' });

    try {
      const requestData = {
        action: 'rewrite',
        content: text,
        settings: settings.ai,
      };
      console.log('发送重写请求:', requestData);

      const response = await invokeWithTimeout<{
        success: boolean;
        data: { rewritten: string };
        message?: string;
      }>('ai_request', requestData, 60000);

      console.log('重写响应:', response);

      set({ status: 'idle', statusMessage: '' });

      if (response.success && response.data?.rewritten) {
        return response.data.rewritten;
      }
      return text;
    } catch (error) {
      console.error('重写错误:', error);
      set({ status: 'error', statusMessage: formatError(error) });
      return text;
    }
  },

  translateText: async (text, targetLang = '英文') => {
    const settings = useAppStore.getState().settings;
    console.log('翻译设置:', settings.ai);

    if (!settings.ai.enabled) {
      console.log('AI功能未启用');
      return text;
    }

    if (!settings.ai.api_key) {
      set({ status: 'error', statusMessage: '请先配置API密钥' });
      return text;
    }

    set({ status: 'loading', statusMessage: '正在翻译...' });

    try {
      const requestData = {
        action: 'translate',
        content: text,
        context: targetLang,
        settings: settings.ai,
      };
      console.log('发送翻译请求:', requestData);

      const response = await invokeWithTimeout<{
        success: boolean;
        data: { translated: string };
        message?: string;
      }>('ai_request', requestData, 60000);

      console.log('翻译响应:', response);

      set({ status: 'idle', statusMessage: '' });

      if (response.success && response.data?.translated) {
        // 返回原文和译文，用特殊分隔符
        return `${text}|||${response.data.translated}`;
      }
      return text;
    } catch (error) {
      console.error('翻译错误:', error);
      set({ status: 'error', statusMessage: formatError(error) });
      return text;
    }
  },

  summarizeText: async (content) => {
    const settings = useAppStore.getState().settings;
    console.log('摘要设置:', settings.ai);

    if (!settings.ai.enabled) {
      console.log('AI功能未启用');
      return '';
    }

    if (!settings.ai.api_key) {
      set({ status: 'error', statusMessage: '请先配置API密钥' });
      return '';
    }

    set({ status: 'loading', statusMessage: '正在生成摘要...' });

    try {
      const requestData = {
        action: 'summarize',
        content,
        settings: settings.ai,
      };
      console.log('发送摘要请求:', requestData);

      const response = await invokeWithTimeout<{
        success: boolean;
        data: { summary: string };
        message?: string;
      }>('ai_request', requestData, 60000);

      console.log('摘要响应:', response);

      set({ status: 'idle', statusMessage: '' });

      if (response.success && response.data?.summary) {
        return response.data.summary;
      }
      return '';
    } catch (error) {
      console.error('摘要错误:', error);
      set({ status: 'error', statusMessage: formatError(error) });
      return '';
    }
  },

  generateOutline: async (content) => {
    const settings = useAppStore.getState().settings;
    console.log('大纲设置:', settings.ai);

    if (!settings.ai.enabled) {
      console.log('AI功能未启用');
      return '';
    }

    if (!settings.ai.api_key) {
      set({ status: 'error', statusMessage: '请先配置API密钥' });
      return '';
    }

    set({ status: 'loading', statusMessage: '正在生成大纲...' });

    try {
      const requestData = {
        action: 'outline',
        content,
        settings: settings.ai,
      };
      console.log('发送大纲请求:', requestData);

      const response = await invokeWithTimeout<{
        success: boolean;
        data: { outline: string };
        message?: string;
      }>('ai_request', requestData, 60000);

      console.log('大纲响应:', response);

      set({ status: 'idle', statusMessage: '' });

      if (response.success && response.data?.outline) {
        return response.data.outline;
      }
      return '';
    } catch (error) {
      console.error('大纲错误:', error);
      set({ status: 'error', statusMessage: formatError(error) });
      return '';
    }
  },

  setChatbotVisible: (visible) => {
    set({ chatbotVisible: visible });
  },

  toggleChatbot: () => {
    set((state) => ({ chatbotVisible: !state.chatbotVisible }));
  },

  sendChatMessage: async (content, attachments) => {
    const settings = useAppStore.getState().settings;

    if (!settings.ai.enabled) {
      set({ status: 'error', statusMessage: 'AI功能未启用' });
      return;
    }

    if (!settings.ai.api_key) {
      set({ status: 'error', statusMessage: '请先配置API密钥' });
      return;
    }

    // Build message content with attachments embedded
    let messageContent = content;
    if (attachments && attachments.length > 0) {
      const attachmentTexts = attachments.map((att) => {
        if (att.type === 'image' && att.dataUrl) {
          return `![${att.name}](${att.dataUrl})`;
        }
        if (att.type === 'text' && att.content) {
          return `> **附件: ${att.name}**\n> \`\`\`\n${att.content}\n> \`\`\`\n`;
        }
        return `> 附件: ${att.name}\n`;
      });
      messageContent = attachmentTexts.join('\n') + (content ? '\n' + content : '');
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
      attachments: attachments ? attachments.map((a) => ({ type: a.type, name: a.name })) : undefined,
    };

    const prevMessages = get().chatbotMessages;
    const assistantId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    set({
      chatbotMessages: [...prevMessages, userMessage, assistantPlaceholder],
      chatbotLoading: true,
      chatbotStreamingPhase: 'reasoning',
    });

    const effort = get().reasoningEffort;
    const effortConfig: Record<string, { temperature: number; max_tokens: number }> = {
      fast: { temperature: 0.9, max_tokens: 800 },
      balanced: { temperature: 0.7, max_tokens: 2000 },
      deep: { temperature: 0.3, max_tokens: 4000 },
    };

    // Only enable thinking for providers that support it (DeepSeek, SiliconFlow)
    const provider = settings.ai.provider;
    const supportsThinking = provider === 'deepseek' || provider === 'siliconflow';

    // Set up event listeners before invoking the streaming command
    const unlisteners: (() => void)[] = [];

    try {
      const history = prevMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const linkedDoc = get().linkedDocument;
      const requestArgs: Record<string, unknown> = {
        content: messageContent,
        context: JSON.stringify(history),
        settings: settings.ai,
        enableThinking: supportsThinking && effort !== 'off',
      };

      if (linkedDoc) {
        requestArgs.doc_context = linkedDoc.content;
        requestArgs.doc_title = linkedDoc.title;
      }
      if (effort !== 'off') {
        const config = effortConfig[effort];
        requestArgs.temperature = config.temperature;
        requestArgs.max_tokens = config.max_tokens;
      }

      // Listen for reasoning chunks
      const unlistenReasoning = await listen<{ content: string }>('ai-chat-reasoning-chunk', (event) => {
        set((state) => ({
          chatbotMessages: state.chatbotMessages.map((m) =>
            m.id === assistantId
              ? { ...m, reasoning: (m.reasoning || '') + event.payload.content }
              : m,
          ),
        }));
      });
      unlisteners.push(unlistenReasoning);

      // Listen for reasoning done
      const unlistenReasoningDone = await listen('ai-chat-reasoning-done', () => {
        set({ chatbotStreamingPhase: 'content' });
      });
      unlisteners.push(unlistenReasoningDone);

      // Listen for content chunks
      const unlistenContent = await listen<{ content: string }>('ai-chat-content-chunk', (event) => {
        set((state) => ({
          chatbotMessages: state.chatbotMessages.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + event.payload.content }
              : m,
          ),
        }));
      });
      unlisteners.push(unlistenContent);

      // Listen for stream error
      const unlistenError = await listen<{ message: string }>('ai-chat-error', (event) => {
        set((state) => ({
          chatbotMessages: state.chatbotMessages.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || `**错误:** ${event.payload.message}` }
              : m,
          ),
          chatbotLoading: false,
          chatbotStreamingPhase: null,
        }));
      });
      unlisteners.push(unlistenError);

      // Listen for stream done
      const unlistenDone = await listen('ai-chat-done', () => {
        set({ chatbotLoading: false, chatbotStreamingPhase: null });
      });
      unlisteners.push(unlistenDone);

      // Start streaming
      await invoke('ai_chat_streaming', requestArgs);
    } catch (error) {
      console.error('Chat streaming error:', error);
      set((state) => ({
        chatbotMessages: state.chatbotMessages.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || `**错误:** ${String(error)}` }
            : m,
        ),
        chatbotLoading: false,
        chatbotStreamingPhase: null,
      }));
    } finally {
      // Clean up all listeners
      for (const unlisten of unlisteners) {
        unlisten();
      }
    }
  },

  clearChatHistory: () => {
    set({ chatbotMessages: [] });
  },

  setReasoningEffort: (effort) => {
    set({ reasoningEffort: effort });
  },

  toggleLinkDocument: () => {
    const current = get().linkedDocument;
    if (current) {
      set({ linkedDocument: null });
    } else {
      const appState = useAppStore.getState();
      const activeTab = appState.getActiveTab();
      if (activeTab && activeTab.content.trim()) {
        set({
          linkedDocument: {
            title: activeTab.title,
            content: activeTab.content,
          },
        });
      }
    }
  },

  setLinkedDocument: (doc) => {
    set({ linkedDocument: doc });
  },

  setProofreadPanelVisible: (visible) => {
    set({ proofreadPanelVisible: visible });
  },

  setCompanionVisible: (visible, position) => {
    set({
      companionVisible: visible,
      companionPosition: position || null,
    });
  },

  setCurrentStyle: (style) => {
    set({ currentStyle: style });
  },

  setTranslationVisible: (visible, position?, original?, result?) => {
    set({
      translationVisible: visible,
      translationPosition: position || null,
      translationOriginal: original || '',
      translationResult: result || '',
    });
  },

  applySuggestion: (suggestion) => {
    const { editorView, setContent, content } = useAppStore.getState();
    if (!editorView) {
      setContent(content + suggestion);
      return;
    }

    const selection = editorView.state.selection.main;
    const transaction = editorView.state.update({
      changes: {
        from: selection.to,
        to: selection.to,
        insert: suggestion,
      },
    });
    editorView.dispatch(transaction);
    editorView.focus();

    set({ companionVisible: false, companionSuggestions: [] });
  },

  applyProofreadFix: (result) => {
    const { editorView } = useAppStore.getState();
    if (!editorView) return;

    const transaction = editorView.state.update({
      changes: {
        from: result.from,
        to: result.to,
        insert: result.suggestion,
      },
    });
    editorView.dispatch(transaction);
    editorView.focus();

    // Remove this result from the list
    const newResults = get().proofreadResults.filter(r => r !== result);
    set({
      proofreadResults: newResults,
      errorCount: newResults.length,
      proofreadPanelVisible: newResults.length > 0,
    });
  },

  ignoreProofreadResult: (result) => {
    // Just remove this result from the list without applying the fix
    const newResults = get().proofreadResults.filter(r => r !== result);
    set({
      proofreadResults: newResults,
      errorCount: newResults.length,
      proofreadPanelVisible: newResults.length > 0,
      status: newResults.length > 0 ? 'success' : 'idle',
      statusMessage: newResults.length > 0 ? `剩余 ${newResults.length} 处问题` : '校对完成',
    });
  },

  clearResults: () => {
    set({
      status: 'idle',
      statusMessage: '',
      proofreadResults: [],
      errorCount: 0,
      companionSuggestions: [],
      proofreadPanelVisible: false,
    });
  },
}));
