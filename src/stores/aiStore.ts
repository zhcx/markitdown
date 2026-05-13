import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
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

export type AIStatus = 'idle' | 'loading' | 'proofreading' | 'companion' | 'success' | 'error';

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

    try {
      const requestData = {
        action: 'proofread',
        content: trimmedContent,
        settings: settings.ai,
      };

      const response = await invokeWithTimeout<{
        success: boolean;
        data: ProofreadResult[];
        message?: string;
      }>('ai_request', requestData, 45000);

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
      } else {
        set({ status: 'error', statusMessage: response.message || '校对失败' });
      }
    } catch (error) {
      console.error('AI proofreading failed:', error);
      set({ status: 'error', statusMessage: formatError(error) });
    }
  },

  getCompanionSuggestion: async (content, context) => {
    const settings = useAppStore.getState().settings;
    console.log('伴写设置:', settings.ai);

    if (!settings.ai.enabled) {
      set({ status: 'error', statusMessage: 'AI功能未启用' });
      return;
    }

    if (!settings.ai.api_key) {
      set({ status: 'error', statusMessage: '请先配置API密钥' });
      return;
    }

    set({ status: 'loading', statusMessage: '正在生成建议...' });

    try {
      const requestData = {
        action: 'companion',
        content,
        context: context || undefined,
        settings: settings.ai,
      };
      console.log('发送伴写请求:', requestData);

      const response = await invokeWithTimeout<{
        success: boolean;
        data: { suggestions: string[] };
        message?: string;
      }>('ai_request', requestData, 60000);

      console.log('伴写响应:', response);

      if (response.success && response.data?.suggestions) {
        set({
          status: 'success',
          statusMessage: '',
          companionSuggestions: response.data.suggestions,
          companionVisible: true,
        });
      } else {
        set({ status: 'error', statusMessage: response.message || '生成建议失败' });
      }
    } catch (error) {
      console.error('伴写错误:', error);
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
