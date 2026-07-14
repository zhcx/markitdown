import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAIStore, type ChatMessage, type ReasoningEffort } from '../../stores/aiStore';
import { AI_PROVIDER_DEFINITIONS, useAppStore, type AIProviderId, type AIProviderProfile } from '../../stores/appStore';
import { useSkillStore } from '../../stores/skillStore';
import { formatWebSearchContext, performWebSearch, type WebSearchResponse } from '../../services/webSearch';
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

interface PendingAttachment {
  type: 'image' | 'text' | 'file';
  name: string;
  dataUrl?: string;
  content?: string;
}

function ComposerIcon({ type }: { type: 'attach' | 'document' | 'send' | 'skills' | 'search' | 'reasoning' | 'chevronDown' }) {
  if (type === 'attach') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 8.8 9.7 4.3a2.35 2.35 0 1 1 3.3 3.3l-5.4 5.4a3.6 3.6 0 0 1-5.1-5.1l5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  }
  if (type === 'document') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.8h5l3 3v9.4H4zM9 1.8v3.3h3M6 8h4M6 10.5h4" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === 'send') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m2.2 2.5 11.2 5.1-11.2 5.1 2-5.1z" fill="currentColor" /><path d="M4.2 7.6h8.2" fill="none" stroke="var(--bg-elevated)" strokeWidth="1.15" strokeLinecap="round" /></svg>;
  }
  if (type === 'skills') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.8 5 2.55L8 6.9 3 4.35 8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="m3 7.05 5 2.55 5-2.55M3 9.75l5 2.55 5-2.55" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (type === 'search') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="m10.2 10.2 3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
  }
  if (type === 'reasoning') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.3 10.9a5.7 5.7 0 1 1 11.4 0" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><path d="M8 10.8 10.65 7.9M4.4 11.05h.01M11.6 11.05h.01" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 13.1h9" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></svg>;
  }
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ReasoningOptionIcon({ effort }: { effort: ReasoningEffort }) {
  if (effort === 'off') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="m4.3 4.3 7.4 7.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
  }
  if (effort === 'fast') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m9.45 1.8-4.55 6h3.15L6.9 14.2l4.6-6H8.3z" fill="currentColor" /></svg>;
  }
  if (effort === 'balanced') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.2h10M3 8h10M3 10.8h10" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><path d="M5 3.4v9.2M11 3.4v9.2" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".65" /></svg>;
  }
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.1 7.4c-.55-1.65.55-3.35 2.2-3.45.52-1.3 2.86-1.36 3.4 0 1.8-.05 2.8 1.95 1.8 3.35 1.12.72.72 2.53-.5 2.7-.35 1.45-2.45 1.85-3.2.55-1.28.75-2.9-.3-2.45-1.7-1.05-.22-1.55-.9-1.25-1.45Z" fill="none" stroke="currentColor" strokeWidth="1.05" strokeLinejoin="round" /><path d="M6.7 6.1v1.1M9.4 5.9v1.15M7.9 8.6v1.15" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>;
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
  const { skills, loadSkills, importSkillPackage, importSkillFile, setSkillEnabled } = useSkillStore();
  const [chatProvider, setChatProvider] = useState<AIProviderId>(settings.ai.provider);
  const [chatModel, setChatModel] = useState(settings.ai.model);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [webSearchActive, setWebSearchActive] = useState(false);
  const [searchPreview, setSearchPreview] = useState<WebSearchResponse | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);
  const webSearchEnabled = settings.web_search.enabled;

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chatbotMessages]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if ((!text && pendingAttachments.length === 0) || chatbotLoading) return;

    const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    let message = text;
    if (webSearchEnabled && webSearchActive && text) {
      try {
        const search = await performWebSearch(text, settings.web_search);
        setSearchPreview(search);
        message = `${text}\n\n---\n\n[网络搜索上下文]\n${formatWebSearchContext(search)}`;
      } catch (error) {
        window.alert(`网络搜索失败：${String(error)}`);
        return;
      }
    }
    setPendingAttachments([]);
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.removeProperty('height');
    }
    if (webSearchEnabled && webSearchActive && !('__TAURI_INTERNALS__' in window)) return;
    sendChatMessage(message, attachments, { provider: chatProvider, model: chatModel });
  }, [inputValue, pendingAttachments, chatbotLoading, sendChatMessage, chatProvider, chatModel, settings.web_search, webSearchActive, webSearchEnabled]);

  const providerProfiles = useMemo<Record<string, AIProviderProfile>>(() => {
    try {
      return JSON.parse(settings.ai.provider_profiles || '{}');
    } catch {
      return {};
    }
  }, [settings.ai.provider_profiles]);

  const selectedProfile = providerProfiles[chatProvider];
  const selectedDefinition = AI_PROVIDER_DEFINITIONS.find((item) => item.id === chatProvider);
  const availableProviders = AI_PROVIDER_DEFINITIONS.filter((provider) =>
    provider.id === settings.ai.provider || Boolean(providerProfiles[provider.id]?.api_key),
  );
  const chatModels = Array.from(new Set([
    ...(selectedProfile?.models || []),
    selectedProfile?.model,
    chatProvider === settings.ai.provider ? settings.ai.model : undefined,
  ].filter((model): model is string => Boolean(model))));

  const handleChatProviderChange = (provider: AIProviderId) => {
    const profile = providerProfiles[provider];
    setChatProvider(provider);
    setChatModel(profile?.model || AI_PROVIDER_DEFINITIONS.find((item) => item.id === provider)?.model || '');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (!isEnter || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    void handleSend();
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

  const handleImportSkill = async () => {
    try {
      if (!('__TAURI_INTERNALS__' in window)) {
        skillFileInputRef.current?.click();
        return;
      }
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Skill 包', extensions: ['zip', 'md'] }],
      });
      if (!selected || Array.isArray(selected)) return;
      await importSkillPackage(selected);
      setSkillMenuOpen(true);
    } catch (error) {
      window.alert(`导入 Skill 失败：${String(error)}`);
    }
  };

  const handleBrowserSkillFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await importSkillFile(file);
      setSkillMenuOpen(true);
    } catch (error) {
      window.alert(`导入 Skill 失败：${String(error)}`);
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
          <div className="chatbot-ai-selectors">
            <select
              className="chatbot-provider-select"
              value={chatProvider}
              onChange={(event) => handleChatProviderChange(event.target.value as AIProviderId)}
              title="选择 AI 服务商"
            >
              {availableProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.label}</option>
              ))}
            </select>
            <select
              className="chatbot-model-select"
              value={chatModel}
              onChange={(event) => setChatModel(event.target.value)}
              title={selectedDefinition ? `${selectedDefinition.label} 模型` : '选择模型'}
            >
              {chatModels.length > 0 ? chatModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              )) : <option value="">请先在设置中配置模型</option>}
            </select>
          </div>
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
        {searchPreview && <WebSearchPreview response={searchPreview} />}
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

      {skillMenuOpen && (
        <div className="chatbot-skill-panel">
          <div className="chatbot-skill-panel-header">
            <span>Skills</span>
            <button onClick={handleImportSkill}>导入 Skill 包</button>
          </div>
          {skills.length === 0 ? (
            <div className="chatbot-skill-empty">导入 .zip 或 SKILL.md 后即可在对话中使用。</div>
          ) : skills.map((skill) => (
            <label key={skill.id} className="chatbot-skill-item" title={skill.description}>
              <input
                type="checkbox"
                checked={skill.enabled}
                onChange={(event) => void setSkillEnabled(skill.id, event.target.checked)}
              />
              <span>{skill.name}</span>
            </label>
          ))}
        </div>
      )}

      <input
        ref={skillFileInputRef}
        className="chatbot-hidden-file-input"
        type="file"
        accept=".zip,.md,text/markdown,application/zip"
        onChange={handleBrowserSkillFile}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="chatbot-input-area">
        <div className="chatbot-input-toolbar">
          <button className="chatbot-toolbar-btn" onClick={handleAttach} title="上传附件">
            <span className="chatbot-toolbar-icon"><ComposerIcon type="attach" /></span>
          </button>
          <button
            className={`chatbot-toolbar-btn chatbot-link-btn ${linkedDocument ? 'linked' : ''}`}
            onClick={toggleLinkDocument}
            title={linkedDocument ? '取消关联文档' : '关联当前文档'}
          >
            <span className="chatbot-toolbar-icon"><ComposerIcon type="document" /></span>
          </button>
          <button
            className={`chatbot-toolbar-btn ${skillMenuOpen ? 'active' : ''}`}
            onClick={() => setSkillMenuOpen((open) => !open)}
            title="管理 Skills"
          >
            <span className="chatbot-toolbar-icon"><ComposerIcon type="skills" /></span>
            <span className="chatbot-skill-count">{skills.filter((skill) => skill.enabled).length || ''}</span>
          </button>
          <button
            className={`chatbot-toolbar-btn web-search-btn ${webSearchEnabled && webSearchActive ? 'active' : ''}`}
            onClick={() => setWebSearchActive((active) => !active)}
            disabled={!webSearchEnabled}
            aria-pressed={webSearchEnabled && webSearchActive}
            title={webSearchEnabled ? (webSearchActive ? '网络搜索已开启，发送消息时将先搜索' : '开启网络搜索') : '请先在设置中启用网络搜索'}
          >
            <span className="chatbot-toolbar-icon"><ComposerIcon type="search" /></span>
            <span className="chatbot-tool-label">{webSearchActive ? '已开启' : '搜索'}</span>
          </button>
          <div className="reasoning-dropdown" ref={reasoningMenuRef}>
            <button
              className={`chatbot-toolbar-btn reasoning-btn reasoning-${reasoningEffort}`}
              onClick={() => setReasoningMenuOpen(!reasoningMenuOpen)}
              title="思考强度"
            >
            <span className="reasoning-symbol" aria-hidden="true"><ComposerIcon type="reasoning" /></span>
              <span>{reasoningLabels[reasoningEffort]}</span>
              <span className="reasoning-arrow" aria-hidden="true"><ComposerIcon type="chevronDown" /></span>
            </button>
            {reasoningMenuOpen && (
              <div className="reasoning-menu">
                {(Object.keys(reasoningLabels) as ReasoningEffort[]).map((effort) => (
                  <button
                    key={effort}
                    className={`reasoning-menu-item ${effort === reasoningEffort ? 'active' : ''}`}
                    onClick={() => { setReasoningEffort(effort); setReasoningMenuOpen(false); }}
                  >
                    <span className={`reasoning-menu-icon reasoning-menu-icon-${effort}`}><ReasoningOptionIcon effort={effort} /></span>
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
            <span className="chatbot-toolbar-icon"><ComposerIcon type="send" /></span>
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="chatbot-textarea"
          placeholder="输入消息… (Enter 发送, Shift+Enter 换行)"
          rows={4}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDownCapture={handleKeyDown}
          aria-keyshortcuts="Enter"
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

function WebSearchPreview({ response }: { response: WebSearchResponse }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="chatbot-search-preview" aria-label="网络搜索结果">
      <div className="chatbot-search-preview-header">
        <div className="chatbot-search-preview-title">
          <span className="chatbot-search-preview-icon" aria-hidden="true"><ComposerIcon type="search" /></span>
          <div>
            <strong>网络搜索</strong>
            <span>{response.provider === 'tavily' ? 'Tavily' : 'SearXNG'} · {response.results.length} 条来源</span>
          </div>
        </div>
        <button
          className="chatbot-search-preview-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>
      {expanded && (
        <div className="chatbot-search-preview-content">
          {response.answer && <div className="chatbot-search-answer">{response.answer}</div>}
          <div className="chatbot-search-result-list">
            {response.results.map((result, index) => (
              <a
                className="chatbot-search-result-card"
                href={result.url}
                key={`${result.url}-${index}`}
                target="_blank"
                rel="noreferrer"
              >
                <span className="chatbot-search-result-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="chatbot-search-result-body">
                  <strong>{result.title || result.url}</strong>
                  {result.content && <span>{result.content.replace(/\s+/g, ' ').trim()}</span>}
                  <small>{getSearchDomain(result.url)}</small>
                </span>
                <span className="chatbot-search-result-arrow" aria-hidden="true">↗</span>
              </a>
            ))}
            {response.results.length === 0 && <div className="chatbot-search-empty">没有找到相关结果</div>}
          </div>
        </div>
      )}
    </section>
  );
}

function getSearchDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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
