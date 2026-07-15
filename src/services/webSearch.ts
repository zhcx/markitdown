import type { WebSearchSettings } from '../stores/appStore';

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface WebSearchResponse {
  provider: string;
  query: string;
  answer?: string;
  results: WebSearchResult[];
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export async function performWebSearch(query: string, settings: WebSearchSettings): Promise<WebSearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('搜索关键词不能为空');
  if (!settings.enabled) throw new Error('请先在设置中启用网络搜索');
  if (settings.provider === 'tavily' && !settings.tavily_api_key.trim()) throw new Error('请选择其他首选搜索服务，或先填写 Tavily API Key');
  if (settings.provider === 'searxng' && !settings.searxng_url.trim()) throw new Error('请先填写 SearXNG API 地址');

  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<WebSearchResponse>('web_search', { query: normalizedQuery, settings });
  }

  let response: Response;
  try {
    response = await fetch('/api/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: normalizedQuery, settings }),
    });
  } catch {
    throw new Error('浏览器搜索代理不可用，请确认 MarkitDown 开发服务仍在运行');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `浏览器搜索服务失败 (${response.status})`);
  return body as WebSearchResponse;
}

export function formatWebSearchMarkdown(response: WebSearchResponse): string {
  const lines = [`# 网络搜索：${response.query}`, '', `> 搜索服务：${response.provider}`];
  if (response.answer) lines.push('', '## 摘要', '', response.answer);
  lines.push('', '## 搜索结果', '');
  response.results.forEach((result, index) => {
    lines.push(`${index + 1}. [${result.title || result.url}](${result.url})`);
    if (result.content) lines.push(`   ${result.content.replace(/\s+/g, ' ').trim()}`);
    lines.push('');
  });
  return lines.join('\n');
}

export function formatWebSearchContext(response: WebSearchResponse): string {
  const lines = [`以下是网络搜索结果。请基于这些资料回答，并在相关陈述后保留来源链接。`];
  if (response.answer) lines.push(`\n搜索摘要：${response.answer}`);
  response.results.forEach((result, index) => {
    lines.push(`\n[来源 ${index + 1}] ${result.title}\nURL: ${result.url}\n${result.content}`);
  });
  return lines.join('\n');
}
