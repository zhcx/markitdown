import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useAIStore } from '../../stores/aiStore';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { TablePicker } from '../Editor/TablePicker';
import { formatMarkdown, type MarkdownFormatResult } from '../../utils/markdownFormatter';

type ToolbarIconName = 'link' | 'image' | 'video' | 'table' | 'folder' | 'chat' | 'proofread' | 'sparkle' | 'palette' | 'rewrite' | 'translate' | 'summary' | 'outline';

interface ToolbarButton {
  label?: string;
  icon?: ToolbarIconName;
  title: string;
  action: () => void | Promise<void>;
}

interface ToolbarGroup {
  title: string;
  buttons: ToolbarButton[];
}

function ToolbarGlyph({ name }: { name: ToolbarIconName }) {
  if (name === 'link') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6.2 9.8 3.6-3.6M5.1 11.9l-1 .9a2.7 2.7 0 0 1-3.8-3.8l2.3-2.3a2.7 2.7 0 0 1 3.8 0M10.9 4.1l1-.9A2.7 2.7 0 0 1 15.7 7l-2.3 2.3a2.7 2.7 0 0 1-3.8 0" /></svg>;
  if (name === 'image') return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1" /><circle cx="5" cy="6" r="1.2" /><path d="m2.5 12 3.6-3.4 2.2 2 2.2-2.4 3 3" /></svg>;
  if (name === 'video') return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="m6.5 6 4 2-4 2z" /></svg>;
  if (name === 'table') return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2" width="13" height="12" rx=".5" /><path d="M1.5 6h13M1.5 10h13M6 2v12m4-12v12" /></svg>;
  if (name === 'folder') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4h5l1.2 1.5h6.8v7.8h-13z" /></svg>;
  if (name === 'chat') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5h12v8H7l-3.5 3v-3H2z" /><path d="M5 6.5h6" /></svg>;
  if (name === 'proofread') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8.2 6 11.5 13.5 4" /></svg>;
  if (name === 'sparkle') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.5 1 3.5 3.5 1L9 7l-1 3.5L7 7 3.5 6 7 5zM12.5 10l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" /></svg>;
  if (name === 'palette') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a6.4 6.4 0 0 0 0 12.8h1.2a1.4 1.4 0 0 0 0-2.8H8.5a1.3 1.3 0 0 1 0-2.6H12A2.5 2.5 0 0 0 14.5 6C13.8 3.4 11.2 1.5 8 1.5Z" /><circle cx="4.5" cy="6.3" r=".7" /><circle cx="6.4" cy="3.9" r=".7" /><circle cx="9.4" cy="3.8" r=".7" /></svg>;
  if (name === 'rewrite') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h7M3 6.5h5M2.5 13.5l.7-3.2L11.5 2l2.5 2.5-8.3 8.3z" /></svg>;
  if (name === 'translate') return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" /><path d="M1.8 8h12.4M8 1.8c1.6 1.7 2.4 3.7 2.4 6.2S9.6 12.5 8 14.2C6.4 12.5 5.6 10.5 5.6 8S6.4 3.5 8 1.8Z" /></svg>;
  if (name === 'summary') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.8h7l3 3v9.4H3zM10 1.8v3h3M5.2 8h5.6M5.2 10.5h5.6" /></svg>;
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h10M4.5 6h7M6 9.5h4M8 9.5v4" /></svg>;
}

function ImageOptionsModal({ onClose, onInsert }: { onClose: () => void; onInsert: (url: string, alt?: string) => void }) {
  const [mode, setMode] = useState<'link' | 'upload' | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [altText, setAltText] = useState('');
  const { setUploadStatus, settings, setSettingsOpen, setSettingsTab } = useAppStore();

  const handleUpload = async () => {
    try {
      const service = settings.image_hosting.active_service;
      if (!service) {
        setUploadStatus('error', 0, '请先启用并配置图床服务');
        setSettingsTab('image');
        setSettingsOpen(true);
        onClose();
        return;
      }
      const selected = await open({
        multiple: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      });
      if (selected) {
        setUploadStatus('uploading', 0, '正在上传图片...');
        setMode('upload');

        const result = await invoke<string>('upload_image', {
          filePath: selected,
          service,
          settings,
        });

        setUploadStatus('success', 100, '上传成功');
        onInsert(result, altText || '图片');
        onClose();
      }
    } catch (error) {
      setUploadStatus('error', 0, String(error));
    }
  };

  const handleLinkInsert = () => {
    if (imageUrl.trim()) {
      onInsert(imageUrl.trim(), altText.trim() || '图片');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content image-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>插入图片</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {!mode ? (
            <div className="image-options">
              <button className="image-option-btn" onClick={() => setMode('link')}>
                <span className="option-icon"><ToolbarGlyph name="link" /></span>
                <span className="option-text">输入图片链接</span>
                <span className="option-desc">从网络URL插入图片</span>
              </button>
              <button className="image-option-btn" onClick={handleUpload}>
                <span className="option-icon"><ToolbarGlyph name="folder" /></span>
                <span className="option-text">本地图片上传</span>
                <span className="option-desc">选择本地图片上传到图床</span>
              </button>
            </div>
          ) : mode === 'link' ? (
            <div className="link-form">
              <div className="form-field">
                <label>图片链接</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.png"
                />
              </div>
              <div className="form-field">
                <label>替代文本</label>
                <input
                  type="text"
                  value={altText}
                  onChange={e => setAltText(e.target.value)}
                  placeholder="图片描述"
                />
              </div>
              <div className="form-actions">
                <button className="cancel-btn" onClick={() => setMode(null)}>返回</button>
                <button className="save-btn" onClick={handleLinkInsert} disabled={!imageUrl.trim()}>插入</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VideoInsertModal({ onClose, onInsert }: { onClose: () => void; onInsert: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const supported = /^(https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be|bilibili\.com|b23\.tv|vimeo\.com)\//i.test(url.trim());
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content video-insert-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>插入视频</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="modal-body link-form">
          <div className="form-field">
            <label>视频链接</label>
            <input autoFocus type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="粘贴 B站、YouTube 或 Vimeo 视频链接" />
            <small>支持 B站、YouTube、YouTube Shorts 与 Vimeo，预览中将显示响应式播放器。</small>
          </div>
          <div className="form-actions">
            <button className="cancel-btn" onClick={onClose}>取消</button>
            <button className="save-btn" disabled={!supported} onClick={() => { onInsert(url.trim()); onClose(); }}>插入视频</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const EMOJI_GROUPS = [
  { label: '表情', values: ['😀', '😃', '😄', '😁', '😂', '🥹', '😊', '😍', '🥰', '😘', '😎', '🤔', '😴', '😭', '😤', '😱'] },
  { label: '手势', values: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '👌', '✌️', '🤞', '💪', '👋', '👉', '👀'] },
  { label: '符号', values: ['❤️', '🧡', '💛', '💚', '💙', '💜', '✅', '❌', '⚠️', '❗', '❓', '💯', '✨', '🔥'] },
  { label: '写作', values: ['💡', '📝', '📌', '📎', '📚', '🔍', '📊', '🎯', '🚀', '🎉', '🏆', '⏳', '🔔', '🧭'] },
];

function EmojiPicker({ favorites, onClose, onInsert }: { favorites: string[]; onClose: () => void; onInsert: (emoji: string) => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content emoji-picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>插入 Emoji</h2>
          <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="modal-body emoji-picker-body">
          {favorites.length > 0 && (
            <section><div className="emoji-section-title">常用表情 <small>可在“设置 → 编辑器”中修改</small></div><div className="emoji-grid">{favorites.map((emoji) => <button key={emoji} onClick={() => { onInsert(emoji); onClose(); }}>{emoji}</button>)}</div></section>
          )}
          {EMOJI_GROUPS.map((group) => (
            <section key={group.label}><div className="emoji-section-title">{group.label}</div><div className="emoji-grid">{group.values.map((emoji) => <button key={emoji} onClick={() => { onInsert(emoji); onClose(); }}>{emoji}</button>)}</div></section>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarkdownFormatModal({ result, onClose, onApply }: { result: MarkdownFormatResult; onClose: () => void; onApply: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content markdown-format-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header"><h2>Markdown 语法检查</h2><button className="modal-close" onClick={onClose} aria-label="关闭">×</button></div>
        <div className="modal-body">
          <div className={`markdown-format-summary ${result.issues.length ? 'has-issues' : 'is-clean'}`}>
            <strong>{result.issues.length ? `发现 ${result.issues.length} 类可规范项` : 'Markdown 格式已经很规范'}</strong>
            <span>格式化只调整标记、空格与空行，不改写正文内容。</span>
          </div>
          {result.issues.length > 0 && <ul className="markdown-format-issues">{result.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          <div className="form-actions"><button className="cancel-btn" onClick={onClose}>取消</button><button className="save-btn" disabled={!result.changed} onClick={onApply}>应用专业格式</button></div>
        </div>
      </div>
    </div>
  );
}

export function Toolbar() {
  const { editorView, setContent, content, settings } = useAppStore();
  const [showImageModal, setShowImageModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const tablePickerButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarWheelDeltaRef = useRef(0);
  const toolbarWheelFrameRef = useRef<number | null>(null);
  const {
    checkProofread,
    getCompanionSuggestion,
    rewriteSelection,
    translateText,
    summarizeText,
    generateOutline,
    proposeEdit,
    editMode,
    setEditMode,
    setChatbotVisible,
  } = useAIStore();
  const currentStyle = settings.ai.writing_style;

  const getSelectedText = () => {
    if (!editorView) return '';
    const selection = editorView.state.selection.main;
    return editorView.state.sliceDoc(selection.from, selection.to);
  };

  const handleProofread = () => {
    if (!editorView) {
      checkProofread(content);
      return;
    }

    const selection = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(selection.from, selection.to);
    checkProofread(selectedText || content, selectedText ? selection.from : 0);
  };

  const handleCompanion = () => {
    // 获取光标位置前的内容作为上下文
    if (!editorView) return;
    const selection = editorView.state.selection.main;
    const textBefore = editorView.state.sliceDoc(Math.max(0, selection.to - 500), selection.to);

    // 获取光标在视口中的位置
    const coords = editorView.coordsAtPos(selection.to);
    if (coords) {
      useAIStore.getState().setCompanionVisible(true, {
        x: coords.left,
        y: coords.bottom
      });
    }
    getCompanionSuggestion(textBefore);
  };

  const handleRewrite = async () => {
    const selectedText = getSelectedText();
    if (!selectedText) return;
    const rewritten = await rewriteSelection(selectedText);
    if (rewritten && rewritten !== selectedText) {
      const selection = editorView!.state.selection.main;
      proposeEdit({
        kind: 'polish',
        reason: 'AI 重写：用于语言润色与表达优化，不应将其视为事实修改。',
        before: selectedText,
        after: rewritten,
        from: selection.from,
        to: selection.to,
      });
    }
  };

  const handleTranslate = async () => {
    const selectedText = getSelectedText();
    if (!selectedText) return;

    // 获取光标位置
    if (!editorView) return;
    const selection = editorView.state.selection.main;
    const coords = editorView.coordsAtPos(selection.from);

    const result = await translateText(selectedText);
    if (result && result.includes('|||')) {
      const [original, translated] = result.split('|||');
      if (translated && translated !== selectedText) {
        // 显示翻译弹窗
        useAIStore.getState().setTranslationVisible(
          true,
          coords ? { x: coords.left, y: coords.bottom } : null,
          original,
          translated
        );
      }
    }
  };

  const handleSummarize = async () => {
    const summary = await summarizeText(content);
    if (summary) {
      proposeEdit({
        kind: 'structure',
        reason: 'AI 摘要：自动提炼原文，关键结论与数字请人工复核。',
        before: '',
        after: `## 摘要\n\n${summary}\n\n---\n\n`,
        from: 0,
        to: 0,
      });
    }
  };

  const handleOutline = async () => {
    const outline = await generateOutline(content);
    if (outline) {
      const selection = editorView?.state.selection.main;
      const position = selection?.from ?? content.length;
      proposeEdit({
        kind: 'structure',
        reason: 'AI 大纲：根据现有文档组织结构，内容准确性仍需人工确认。',
        before: selection ? content.slice(selection.from, selection.to) : '',
        after: outline,
        from: position,
        to: selection?.to ?? position,
      });
    }
  };

  const wrapSelection = (before: string, after: string) => {
    if (!editorView) {
      setContent(content + before + after);
      return;
    }

    const selection = editorView.state.selection.main;
    const selectedText = editorView.state.sliceDoc(selection.from, selection.to);

    if (selectedText) {
      const transaction = editorView.state.update({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: before + selectedText + after,
        },
        selection: { anchor: selection.from + before.length, head: selection.from + before.length + selectedText.length },
      });
      editorView.dispatch(transaction);
    } else {
      const transaction = editorView.state.update({
        changes: {
          from: selection.from,
          to: selection.from,
          insert: before + after,
        },
        selection: { anchor: selection.from + before.length },
      });
      editorView.dispatch(transaction);
    }
    editorView.focus();
  };

  const insertAtCursor = (text: string, cursorOffset?: number) => {
    if (!editorView) {
      setContent(content + text);
      return;
    }

    const selection = editorView.state.selection.main;
    const transaction = editorView.state.update({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: text,
      },
      selection: { anchor: selection.from + (cursorOffset ?? text.length) },
    });
    editorView.dispatch(transaction);
    editorView.focus();
  };

  const insertBlock = (prefix: string, suffix: string = '\n') => {
    if (!editorView) {
      setContent(content + prefix + suffix);
      return;
    }

    const selection = editorView.state.selection.main;
    const line = editorView.state.doc.lineAt(selection.from);
    const atLineStart = selection.from === line.from;
    const insertText = atLineStart ? prefix + suffix : '\n' + prefix + suffix;
    const insertPos = atLineStart ? line.from : selection.to;
    const cursorOffset = prefix.length;

    const transaction = editorView.state.update({
      changes: {
        from: insertPos,
        to: insertPos,
        insert: insertText,
      },
      selection: { anchor: insertPos + cursorOffset },
    });
    editorView.dispatch(transaction);
    editorView.focus();
  };

  const insertImage = (url: string, alt?: string) => {
    const imageMarkdown = `![${alt || '图片'}](${url})`;
    insertAtCursor(imageMarkdown);
  };

  const insertTable = (rows: number, columns: number) => {
    const header = `| ${Array.from({ length: columns }, (_, index) => `列${index + 1}`).join(' | ')} |`;
    const divider = `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`;
    const body = Array.from({ length: Math.max(1, rows - 1) }, () => `| ${Array.from({ length: columns }, () => '内容').join(' | ')} |`).join('\n');
    insertAtCursor(`\n${header}\n${divider}\n${body}\n`);
    setShowTablePicker(false);
  };

  const insertVideo = (url: string) => insertAtCursor(`\n@[video](${url})\n`);

  const runEditorCommand = (command: 'undo' | 'redo') => {
    if (!editorView) return;
    editorView[command]();
    editorView.focus();
  };

  const clearInlineFormatting = () => {
    if (!editorView) return;
    const selection = editorView.state.selection.main;
    if (selection.empty) return;

    const selected = editorView.state.sliceDoc(selection.from, selection.to);
    const plainText = selected
      .replace(/<\/?(?:u|sup|sub|mark|strong|em|del)>/gi, '')
      .replace(/(\*\*|__|~~|==|`)/g, '')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1');

    if (plainText === selected) return;
    editorView.dispatch({
      changes: { from: selection.from, to: selection.to, insert: plainText },
      selection: { anchor: selection.from, head: selection.from + plainText.length },
    });
    editorView.focus();
  };

  const outdentSelection = () => {
    if (!editorView) return;
    const selection = editorView.state.selection.main;
    const document = editorView.state.doc;
    const start = document.lineAt(selection.from).from;
    const end = document.lineAt(selection.to).to;
    const source = editorView.state.sliceDoc(start, end);
    const outdented = source.replace(/^(?: {1,2}|\t)/gm, '');
    if (outdented === source) return;
    editorView.dispatch({ changes: { from: start, to: end, insert: outdented } });
    editorView.focus();
  };

  const toolbarGroups: ToolbarGroup[] = [
    {
      title: '格式',
      buttons: [
        { label: 'B', title: '加粗 (Ctrl+B)', action: () => wrapSelection('**', '**') },
        { label: 'I', title: '斜体 (Ctrl+I)', action: () => wrapSelection('*', '*') },
        { label: 'S', title: '删除线', action: () => wrapSelection('~~', '~~') },
        { label: '==', title: '高亮', action: () => wrapSelection('==', '==') },
        { label: 'U', title: '下划线', action: () => wrapSelection('<u>', '</u>') },
        { label: '上', title: '上标', action: () => wrapSelection('<sup>', '</sup>') },
        { label: '下', title: '下标', action: () => wrapSelection('<sub>', '</sub>') },
      ],
    },
    {
      title: '标题',
      buttons: [
        { label: 'H1', title: '一级标题', action: () => insertBlock('# ') },
        { label: 'H2', title: '二级标题', action: () => insertBlock('## ') },
        { label: 'H3', title: '三级标题', action: () => insertBlock('### ') },
        { label: 'H4', title: '四级标题', action: () => insertBlock('#### ') },
        { label: 'H5', title: '五级标题', action: () => insertBlock('##### ') },
        { label: 'H6', title: '六级标题', action: () => insertBlock('###### ') },
      ],
    },
    {
      title: '列表',
      buttons: [
        { label: '•', title: '无序列表', action: () => insertBlock('- ') },
        { label: '1.', title: '有序列表', action: () => insertBlock('1. ') },
        { label: '☐', title: '任务列表', action: () => insertBlock('- [ ] ') },
        { label: '→', title: '缩进', action: () => insertAtCursor('  ') },
      ],
    },
    {
      title: '编辑',
      buttons: [
        { label: '↶', title: '撤销 (Ctrl+Z)', action: () => runEditorCommand('undo') },
        { label: '↷', title: '重做 (Ctrl+Y)', action: () => runEditorCommand('redo') },
        { label: '↤', title: '减少缩进', action: outdentSelection },
        { label: '清', title: '清除选中文本的行内格式', action: clearInlineFormatting },
        { label: 'MD', title: '检查并格式化 Markdown', action: () => setShowFormatModal(true) },
      ],
    },
    {
      title: '插入',
      buttons: [
        { icon: 'link', title: '链接', action: () => wrapSelection('[', '](url)') },
        { icon: 'image', title: '图片', action: () => setShowImageModal(true) },
        { icon: 'video', title: '插入视频（B站 / YouTube / Vimeo）', action: () => setShowVideoModal(true) },
        { label: '😊', title: '插入原生 Emoji', action: () => setShowEmojiPicker(true) },
        { icon: 'table', title: '表格', action: () => insertAtCursor('\n| 列1 | 列2 | 列3 |\n|---|---|---|\n| 内容 | 内容 | 内容 |\n') },
        { label: '</>', title: '代码块', action: () => insertAtCursor('\n```\ncode\n```\n', 5) },
        { label: 'Q', title: '引用', action: () => insertBlock('> ') },
        { label: '—', title: '分割线', action: () => insertAtCursor('\n---\n') },
      ],
    },
    {
      title: '高级',
      buttons: [
        { label: '∑', title: '行内公式', action: () => wrapSelection('$', '$') },
        { label: 'Σ', title: '公式块', action: () => insertBlock('$$\n', '\n$$\n') },
        { label: 'Ⓕ', title: '脚注', action: () => wrapSelection('[^', ']()') },
        { label: 'M', title: 'Mermaid 流程图', action: () => insertAtCursor('\n```mermaid\nflowchart LR\n  A[开始] --> B{判断}\n  B -->|是| C[执行]\n  B -->|否| D[结束]\n```\n', 24) },
        { label: '↔', title: 'Mermaid 时序图', action: () => insertAtCursor('\n```mermaid\nsequenceDiagram\n  participant 用户\n  participant 服务\n  用户->>服务: 请求\n  服务-->>用户: 响应\n```\n', 28) },
        { label: '▥', title: 'Mermaid 甘特图', action: () => insertAtCursor('\n```mermaid\ngantt\n  title 项目计划\n  dateFormat YYYY-MM-DD\n  section 开发\n  功能开发 :a1, 2026-01-01, 7d\n  测试 :a2, after a1, 3d\n```\n', 22) },
        { label: '❖', title: '目录', action: () => insertAtCursor('\n[TOC]\n') },
        { label: '▸', title: '插入可折叠内容', action: () => insertAtCursor('\n<details>\n<summary>展开查看</summary>\n\n内容\n\n</details>\n', 32) },
        { label: '※', title: '插入注释', action: () => insertAtCursor('<!-- 注释 -->', 5) },
        { label: '⌁', title: '插入分页符', action: () => insertAtCursor('\n<div style="page-break-after: always;"></div>\n') },
      ],
    },
  ];

  toolbarGroups[3].buttons.unshift({ icon: 'table', title: '插入表格（拖动选择行列）', action: () => setShowTablePicker((visible) => !visible) });

  const styleNames: Record<string, string> = {
    formal: '正式',
    casual: '活泼',
    academic: '学术',
    creative: '创意',
    custom: '自定义'
  };

  const handleStyleChange = () => {
    const styles = ['formal', 'casual', 'academic', 'creative', 'custom'] as const;
    const latestSettings = useAppStore.getState().settings;
    const currentIndex = styles.indexOf(latestSettings.ai.writing_style);
    const nextIndex = (currentIndex + 1) % styles.length;
    const newStyle = styles[nextIndex];
    void useAppStore.getState().saveSettings({
      ...latestSettings,
      ai: { ...latestSettings.ai, writing_style: newStyle },
    });
    // 显示风格切换提示
    const { setStatus } = useAIStore.getState();
    const message = `风格切换为: ${styleNames[newStyle]}`;
    setStatus('success', message);
    setTimeout(() => {
      const aiState = useAIStore.getState();
      if (aiState.status === 'success' && aiState.statusMessage === message) {
        aiState.setStatus('idle');
      }
    }, 2000);
  };

  const handleEditModeChange = () => {
    const modes = ['ask', 'suggest', 'agent'] as const;
    const nextMode = modes[(modes.indexOf(editMode) + 1) % modes.length];
    setEditMode(nextMode);
    const labels = { ask: '询问模式：只回答', suggest: '建议模式：先审 Diff', agent: '代理模式：关键写入仍需确认' };
    useAIStore.getState().setStatus('success', labels[nextMode]);
  };

  // AI按钮组 - 仅在启用时显示
  const aiGroup: ToolbarGroup | null = settings.ai.enabled ? {
    title: 'AI',
    buttons: [
      { label: editMode === 'ask' ? '问' : editMode === 'suggest' ? '建' : '代', title: `AI 操作模式：${editMode === 'ask' ? '询问（只回答）' : editMode === 'suggest' ? '建议（先审 Diff）' : '代理（关键写入确认）'}`, action: handleEditModeChange },
      { icon: 'chat', title: '显示 AI 对话', action: () => setChatbotVisible(true) },
      { icon: 'proofread', title: '校对文字', action: handleProofread },
      { icon: 'sparkle', title: '伴写建议', action: handleCompanion },
      { icon: 'palette', title: `风格: ${styleNames[currentStyle] || currentStyle}`, action: handleStyleChange },
      { icon: 'rewrite', title: '重写选中', action: handleRewrite },
      { icon: 'translate', title: '翻译选中', action: handleTranslate },
      { icon: 'summary', title: '生成摘要', action: handleSummarize },
      { icon: 'outline', title: '生成大纲', action: handleOutline },
    ],
  } : null;

  if (aiGroup) {
    toolbarGroups.push(aiGroup);
  }

  useEffect(() => {
    return () => {
      if (toolbarWheelFrameRef.current !== null) {
        cancelAnimationFrame(toolbarWheelFrameRef.current);
      }
    };
  }, []);

  const handleToolbarWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const canScroll = maxScrollLeft > 0;
    if (!canScroll) return;

    const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (rawDelta === 0) return;

    const deltaUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientWidth : 1;
    const delta = rawDelta * deltaUnit;
    const canMove = delta < 0 ? container.scrollLeft > 0 : container.scrollLeft < maxScrollLeft;
    if (!canMove) return;

    event.preventDefault();
    toolbarWheelDeltaRef.current += delta;

    if (toolbarWheelFrameRef.current !== null) return;

    toolbarWheelFrameRef.current = requestAnimationFrame(() => {
      const nextScrollLeft = container.scrollLeft + toolbarWheelDeltaRef.current;
      container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, nextScrollLeft));
      toolbarWheelDeltaRef.current = 0;
      toolbarWheelFrameRef.current = null;
    });
  };

  return (
    <div className="toolbar">
      <div className="toolbar-scroll-area" onWheel={handleToolbarWheel}>
        <div className="toolbar-left">
          {toolbarGroups.map((group) => (
            <div className="toolbar-group" key={group.title}>
              <span className="toolbar-group-title">{group.title}</span>
              <div className="toolbar-buttons">
                {group.buttons.map((btn) => (
                  <button
                    key={btn.title}
                    ref={btn.title.includes('插入表格') ? tablePickerButtonRef : undefined}
                    className="toolbar-btn"
                    title={btn.title}
                    aria-label={btn.title}
                    onClick={btn.action}
                  >
                    {btn.icon ? <ToolbarGlyph name={btn.icon} /> : btn.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {showImageModal && (
        <ImageOptionsModal
          onClose={() => setShowImageModal(false)}
          onInsert={insertImage}
        />
      )}
      {showVideoModal && <VideoInsertModal onClose={() => setShowVideoModal(false)} onInsert={insertVideo} />}
      {showEmojiPicker && <EmojiPicker favorites={settings.editor.favorite_emojis} onClose={() => setShowEmojiPicker(false)} onInsert={insertAtCursor} />}
      {showFormatModal && (
        <MarkdownFormatModal
          result={formatMarkdown(content)}
          onClose={() => setShowFormatModal(false)}
          onApply={() => {
            const result = formatMarkdown(content);
            setContent(result.content);
            setShowFormatModal(false);
            useAIStore.getState().setStatus('success', `Markdown 格式化完成：处理 ${result.issues.length} 类问题`);
          }}
        />
      )}
      {showTablePicker && (
        <TablePicker
          anchorRef={tablePickerButtonRef}
          onInsert={insertTable}
          onClose={() => setShowTablePicker(false)}
        />
      )}
    </div>
  );
}
