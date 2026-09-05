import { useAIStore } from '../stores/aiStore';

/**
 * 「保存/另存为」对话框的默认文件名（不含扩展名）。
 * 未命名文档且启用 AI 时调用 AI 建议文件名；其余情况直接沿用原标题。
 * AI 功能未启用时不会发起请求，立即回退，保存对话框照常秒开。
 */
export async function resolveSaveBaseName(title: string, content: string): Promise<string> {
  const fallback = title === '未命名' ? '未命名' : title.replace(/\.md$/i, '');
  if (title !== '未命名' || !content.trim()) return fallback;

  const aiStore = useAIStore.getState();
  aiStore.setStatus('loading', 'AI 正在建议文件名...');
  try {
    const suggested = await aiStore.suggestFilename(content);
    aiStore.setStatus('idle', '');
    return suggested || fallback;
  } catch {
    aiStore.setStatus('idle', '');
    return fallback;
  }
}
