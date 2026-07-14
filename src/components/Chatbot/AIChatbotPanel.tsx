import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAIStore, type ChatMessage, type ReasoningEffort } from '../../stores/aiStore';
import { useAppStore } from '../../stores/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, breaks: true, linkify: true });

const reasoningLabels: Record<ReasoningEffort, string> = {
  off: '关闭',
  fast: '快速',
  balanced: '均衡',
  deep: '深度',
};

const reasoningIcons: Record<ReasoningEffort, string> = {
  off: '⊘',
  fast: '⚡',
  balanced: '⚖️',
  deep: '🧠',
};

interface PendingAttachment {
  type: 'image' | 'text' | 'file';
  name: string;
  dataUrl?: string;
  content?: string;
}

function ComposerIcon({ type }: { type: 'attach' | 'document' | 'send' }) {
  if (type === 'attach') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 8.8 9.7 4.3a2.35 2.35 0 1 1 3.3 3.3l-5.4 5.4a3.6 3.6 0 0 1-5.1-5.1l5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  }
  if (type === 'document') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.8h5l3 3v9.4H4zM9 1.8v3.3h3M6 8h4M6 10.5h4" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m2.2 2.5 11.2 5.1-11.2 5.1 2-5.1z" fill="currentColor" /><path d="M4.2 7.6h8.2" fill="none" stroke="var(--bg-elevated)" strokeWidth="1.15" strokeLinecap="round" /></svg>;
}

export function AIChatbotPanel() {
  const {
    chatbotMessages,
    chatbotLoading,
    setChatbotVisible,
    sendChatMessage,
    clearChatHistory,
    reasoningEffort,
    setReasoningEffort,
    linkedDocument,
    toggleLinkDocument,
  } = useAIStore();

  const { settings } = useAppStore();
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chatbotMessages]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if ((!text && pendingAttachments.length === 0) || chatbotLoading) return;

    const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    setPendingAttachments([]);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.removeProperty('height');
    }
    sendChatMessage(text, attachments);
  }, [inputValue, pendingAttachments, chatbotLoading, sendChatMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttach = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          { name: '图片和文本', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'txt', 'md', 'json', 'yaml', 'yml', 'xml', 'csv', 'log'] },
        ],
      });

      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];

      const newAttachments: PendingAttachment[] = [];

      for (const path of paths) {
        const ext = path.split('.').pop()?.toLowerCase() || '';
        const name = path.split(/[/\\]/).pop() || path;
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);

        if (isImage) {
          const dataUrl = await invoke<string>('read_file_base64', { path });
          newAttachments.push({ type: 'image', name, dataUrl });
        } else {
          const content = await invoke<string>('get_file_content', { path });
          newAttachments.push({ type: 'text', name, content });
        }
      }

      setPendingAttachments(prev => [...prev, ...newAttachments]);
    } catch (err) {
      console.error('Failed to attach file:', err);
    }
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const reasoningMenuRef = useRef<HTMLDivElement>(null);

  // Close reasoning menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reasoningMenuRef.current && !reasoningMenuRef.current.contains(e.target as Node)) {
        setReasoningMenuOpen(false);
      }
    };
    if (reasoningMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [reasoningMenuOpen]);

  return (
    <div className="chatbot-panel">
      <div className="chatbot-header">
        <div className="chatbot-header-left">
          <h4>AI 对话</h4>
          <span className="chatbot-model-badge">
            {settings.ai.model || 'AI'}
          </span>
        </div>
        <button className="chatbot-close-btn" onClick={() => setChatbotVisible(false)} title="关闭">
          ×
        </button>
      </div>

      <div className="chatbot-messages" ref={listRef}>
        {chatbotMessages.length === 0 ? (
          <div className="chatbot-empty">
            <div className="chatbot-empty-icon">💬</div>
            <div className="chatbot-empty-text">开始 AI 对话</div>
            <div className="chatbot-empty-hint">
              向 AI 提问关于当前文档的内容，或寻求写作帮助
            </div>
          </div>
        ) : (
          chatbotMessages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))
        )}
        {chatbotLoading && chatbotMessages[chatbotMessages.length - 1]?.role === 'user' && (
          <div className="chatbot-message assistant">
            <div className="chatbot-avatar assistant-avatar">AI</div>
            <div className="chatbot-bubble assistant-bubble thinking">
              <span className="chatbot-typing-dot" />
              <span className="chatbot-typing-dot" />
              <span className="chatbot-typing-dot" />
            </div>
          </div>
        )}
      </div>

      {pendingAttachments.length > 0 && (
        <div className="chatbot-attachment-bar">
          {pendingAttachments.map((att, i) => (
            <div key={i} className="chatbot-attachment-chip">
              {att.type === 'image' ? '🖼️' : '📄'}
              <span className="chatbot-attachment-name">{att.name}</span>
              <button className="chatbot-attachment-remove" onClick={() => removeAttachment(i)}>×</button>
            </div>
          ))}
        </div>
      )}

      {linkedDocument && (
        <div className="chatbot-linked-doc-bar">
          <span className="chatbot-linked-doc-icon">📄</span>
          <span className="chatbot-linked-doc-name">{linkedDocument.title}</span>
          <button className="chatbot-linked-doc-unlink" onClick={toggleLinkDocument} title="取消关联">×</button>
        </div>
      )}

      <div className="chatbot-input-area">
        <div className="chatbot-input-toolbar">
          <button className="chatbot-toolbar-btn" onClick={handleAttach} title="上传附件">
            <ComposerIcon type="attach" />
          </button>
          <button
            className={`chatbot-toolbar-btn chatbot-link-btn ${linkedDocument ? 'linked' : ''}`}
            onClick={toggleLinkDocument}
            title={linkedDocument ? '取消关联文档' : '关联当前文档'}
          >
            <ComposerIcon type="document" />
          </button>
          <div className="reasoning-dropdown" ref={reasoningMenuRef}>
            <button
              className={`chatbot-toolbar-btn reasoning-btn reasoning-${reasoningEffort}`}
              onClick={() => setReasoningMenuOpen(!reasoningMenuOpen)}
              title="思考强度"
            >
              <span className="reasoning-symbol" aria-hidden="true">✦</span>
              <span>{reasoningLabels[reasoningEffort]}</span>
              <span className="reasoning-arrow" aria-hidden="true">⌄</span>
            </button>
            {reasoningMenuOpen && (
              <div className="reasoning-menu">
                {(Object.keys(reasoningLabels) as ReasoningEffort[]).map((effort) => (
                  <button
                    key={effort}
                    className={`reasoning-menu-item ${effort === reasoningEffort ? 'active' : ''}`}
                    onClick={() => { setReasoningEffort(effort); setReasoningMenuOpen(false); }}
                  >
                    <span className="reasoning-menu-icon">{reasoningIcons[effort]}</span>
                    <span className="reasoning-menu-label">{reasoningLabels[effort]}</span>
                    <span className="reasoning-menu-desc">
                      {effort === 'off' ? '不额外设置' : effort === 'fast' ? '快速响应' : effort === 'balanced' ? '均衡兼顾' : '深度思考'}
                    </span>
                    {effort === reasoningEffort && <span className="reasoning-menu-check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="chatbot-toolbar-spacer" />
          <button
            className="chatbot-send-btn"
            disabled={chatbotLoading || (!inputValue.trim() && pendingAttachments.length === 0)}
            onClick={handleSend}
          >
            <ComposerIcon type="send" />
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="chatbot-textarea"
          placeholder="输入消息… (Enter 发送, Shift+Enter 换行)"
          rows={4}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={chatbotLoading}
        />
      </div>

      <div className="chatbot-footer">
        <span className="chatbot-footer-hint">Enter 发送 · Shift+Enter 换行</span>
        {chatbotMessages.length > 0 && (
          <button className="chatbot-clear-btn" onClick={clearChatHistory}>
            清空对话
          </button>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const time = new Date(message.timestamp);
  const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const [copied, setCopied] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const userToggledRef = useRef(false);

  const { chatbotLoading, chatbotStreamingPhase, chatbotMessages } = useAIStore();
  const isStreaming = chatbotLoading && !isUser &&
    chatbotMessages.length > 0 &&
    chatbotMessages[chatbotMessages.length - 1].id === message.id;

  // Auto-expand reasoning during reasoning phase, auto-collapse when content starts
  useEffect(() => {
    if (!isStreaming) return;
    if (chatbotStreamingPhase === 'reasoning') {
      if (!userToggledRef.current) {
        setReasoningExpanded(true);
      }
    } else if (chatbotStreamingPhase === 'content') {
      if (!userToggledRef.current) {
        setReasoningExpanded(false);
      }
    }
  }, [isStreaming, chatbotStreamingPhase]);

  const handleToggleReasoning = () => {
    userToggledRef.current = true;
    setReasoningExpanded(!reasoningExpanded);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignored */ }
  };

  const renderedHtml = useMemo(() => {
    if (!message.content) return '';
    return md.render(message.content);
  }, [message.content]);

  const renderedReasoning = useMemo(() => {
    if (!message.reasoning) return '';
    return md.render(message.reasoning);
  }, [message.reasoning]);

  return (
    <div className={`chatbot-message ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && <div className="chatbot-avatar assistant-avatar">AI</div>}
      <div className="chatbot-message-body">
        <div className={`chatbot-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
          {message.reasoning && (
            <div className={`chatbot-reasoning ${reasoningExpanded ? 'expanded' : ''}`}>
              <button
                className="chatbot-reasoning-toggle"
                onClick={handleToggleReasoning}
              >
                <span className="chatbot-reasoning-arrow">{reasoningExpanded ? '▼' : '▶'}</span>
                <span>{isStreaming && chatbotStreamingPhase === 'reasoning' ? '正在思考…' : '思考过程'}</span>
              </button>
              {reasoningExpanded && (
                <div
                  className="chatbot-reasoning-content"
                  dangerouslySetInnerHTML={{ __html: renderedReasoning }}
                />
              )}
            </div>
          )}
          {message.content ? (
            <div
              className="chatbot-bubble-content"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : isStreaming ? (
            <div className="chatbot-bubble-content">
              <span className="chatbot-typing-dot" />
              <span className="chatbot-typing-dot" />
              <span className="chatbot-typing-dot" />
            </div>
          ) : null}
          <div className="chatbot-bubble-footer">
            {!isUser && message.content && (
              <button className="chatbot-copy-btn" onClick={handleCopy} title="复制">
                {copied ? '✓' : '📋'}
              </button>
            )}
          </div>
        </div>
        <div className={`chatbot-message-time ${isUser ? 'user' : 'assistant'}`}>
          {timeStr}
        </div>
      </div>
      {isUser && <div className="chatbot-avatar user-avatar">我</div>}
    </div>
  );
}
