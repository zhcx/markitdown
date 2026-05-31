import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useAIStore } from '../../stores/aiStore';
import { EditorSelection } from '@codemirror/state';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

function ImageOptionsModal({ onClose, onInsert }: { onClose: () => void; onInsert: (url: string, alt?: string) => void }) {
  const [mode, setMode] = useState<'link' | 'upload' | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [altText, setAltText] = useState('');
  const { setUploadStatus } = useAppStore();

  const handleUpload = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      });
      if (selected) {
        setUploadStatus('uploading', 0, '正在上传图片...');
        setMode('upload');

        const result = await invoke<string>('upload_image', {
          filePath: selected,
          service: 'local'
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
                <span className="option-icon">🔗</span>
                <span className="option-text">输入图片链接</span>
                <span className="option-desc">从网络URL插入图片</span>
              </button>
              <button className="image-option-btn" onClick={handleUpload}>
                <span className="option-icon">📁</span>
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

export function Toolbar() {
  const { mode, setMode, editorView, setContent, content, sidebarVisible, setSidebarVisible, settings } = useAppStore();
  const [showImageModal, setShowImageModal] = useState(false);
  const toolbarWheelDeltaRef = useRef(0);
  const toolbarWheelFrameRef = useRef<number | null>(null);
  const {
    checkProofread,
    getCompanionSuggestion,
    rewriteSelection,
    translateText,
    summarizeText,
    generateOutline,
    currentStyle,
    setCurrentStyle,
    toggleChatbot,
    chatbotVisible,
  } = useAIStore();

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
      const transaction = editorView!.state.update({
        changes: { from: selection.from, to: selection.to, insert: rewritten },
      });
      editorView!.dispatch(transaction);
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
      // 在文档开头插入摘要
      const transaction = editorView?.state.update({
        changes: { from: 0, to: 0, insert: `## 摘要\n\n${summary}\n\n---\n\n` },
      });
      if (transaction && editorView) {
        editorView.dispatch(transaction);
      }
    }
  };

  const handleOutline = async () => {
    const outline = await generateOutline(content);
    if (outline) {
      insertAtCursor(outline);
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
        selection: EditorSelection.range(selection.from + before.length, selection.from + before.length + selectedText.length),
      });
      editorView.dispatch(transaction);
    } else {
      const transaction = editorView.state.update({
        changes: {
          from: selection.from,
          to: selection.from,
          insert: before + after,
        },
        selection: EditorSelection.cursor(selection.from + before.length),
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
      selection: EditorSelection.cursor(selection.from + (cursorOffset ?? text.length)),
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
      selection: EditorSelection.cursor(insertPos + cursorOffset),
    });
    editorView.dispatch(transaction);
    editorView.focus();
  };

  const insertImage = (url: string, alt?: string) => {
    const imageMarkdown = `![${alt || '图片'}](${url})`;
    insertAtCursor(imageMarkdown);
  };

  const toolbarGroups = [
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
      title: '插入',
      buttons: [
        { label: '🔗', title: '链接', action: () => wrapSelection('[', '](url)') },
        { label: '📷', title: '图片', action: () => setShowImageModal(true) },
        { label: '📊', title: '表格', action: () => insertAtCursor('\n| 列1 | 列2 | 列3 |\n|---|---|---|\n| 内容 | 内容 | 内容 |\n') },
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
        { label: 'M', title: 'Mermaid', action: () => insertAtCursor('\n```mermaid\ngraph LR\n  A --> B\n```\n', 20) },
        { label: '❖', title: '目录', action: () => insertAtCursor('\n[TOC]\n') },
      ],
    },
  ];

  const styleNames: Record<string, string> = {
    formal: '正式',
    casual: '活泼',
    academic: '学术',
    creative: '创意',
    custom: '自定义'
  };

  const handleStyleChange = () => {
    const styles = ['formal', 'casual', 'academic', 'creative', 'custom'] as const;
    const currentIndex = styles.indexOf(currentStyle);
    const nextIndex = (currentIndex + 1) % styles.length;
    const newStyle = styles[nextIndex];
    setCurrentStyle(newStyle);
    // 显示风格切换提示
    const { setStatus } = useAIStore.getState();
    setStatus('success', `风格切换为: ${styleNames[newStyle]}`);
    setTimeout(() => setStatus('idle'), 2000);
  };

  // AI按钮组 - 仅在启用时显示
  const aiGroup = settings.ai.enabled ? {
    title: 'AI',
    buttons: [
      { label: '💬', title: chatbotVisible ? '关闭AI对话' : 'AI对话', action: () => toggleChatbot() },
      { label: '✓', title: '校对文字', action: handleProofread },
      { label: '✨', title: '伴写建议', action: handleCompanion },
      { label: '🎨', title: `风格: ${styleNames[currentStyle] || currentStyle}`, action: handleStyleChange },
      { label: '📝', title: '重写选中', action: handleRewrite },
      { label: '🌐', title: '翻译选中', action: handleTranslate },
      { label: '📋', title: '生成摘要', action: handleSummarize },
      { label: '💡', title: '生成大纲', action: handleOutline },
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
      <div className="toolbar-left" onWheel={handleToolbarWheel}>
        {toolbarGroups.map((group) => (
          <div className="toolbar-group" key={group.title}>
            <span className="toolbar-group-title">{group.title}</span>
            <div className="toolbar-buttons">
              {group.buttons.map((btn) => (
                <button
                  key={btn.title}
                  className="toolbar-btn"
                  title={btn.title}
                  onClick={btn.action}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="toolbar-right">
        <button
          className="toolbar-btn"
          title={sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'}
          onClick={() => setSidebarVisible(!sidebarVisible)}
        >
          {sidebarVisible ? '📁' : '📂'}
        </button>
        <button
          className="toolbar-btn mode-btn"
          title={mode === 'split' ? '切换到沉浸模式' : '切换到分屏模式'}
          onClick={() => setMode(mode === 'split' ? 'immersive' : 'split')}
        >
          {mode === 'split' ? '👁 沉浸' : '📝 分屏'}
        </button>
      </div>
      {showImageModal && (
        <ImageOptionsModal
          onClose={() => setShowImageModal(false)}
          onInsert={insertImage}
        />
      )}
    </div>
  );
}
