import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'

type BrowserWebSearchSettings = {
  enabled: boolean;
  provider: 'tavily' | 'searxng';
  tavily_api_key: string;
  tavily_search_depth: string;
  tavily_include_answer: boolean;
  tavily_max_results: number;
  searxng_url: string;
  searxng_api_key: string;
  searxng_language: string;
  searxng_categories: string;
  searxng_safesearch: number;
  searxng_time_range: string;
  searxng_max_results: number;
};

type BrowserWebSearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

async function fetchSearchService(input: string | URL, init: RequestInit, service: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${service}请求超时，请检查服务地址和网络连接`, { cause: error });
    }
    const cause = error && typeof error === 'object' && 'cause' in error
      ? (error as { cause?: { code?: string; message?: string } }).cause
      : undefined;
    const detail = cause?.code || cause?.message;
    throw new Error(`无法连接${service}${detail ? `（${detail}）` : ''}，请检查服务地址、网络连接或代理设置`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function registerBrowserWebSearch(server: ViteDevServer) {
  server.middlewares.use('/api/web-search', async (req, res, next) => {
    if (req.method !== 'POST') {
      next();
      return;
    }

    try {
      const payload = JSON.parse(await readBody(req)) as { query?: string; settings?: BrowserWebSearchSettings };
      const query = payload.query?.trim() || '';
      const settings = payload.settings;
      if (!query) throw new Error('搜索关键词不能为空');
      if (!settings?.enabled) throw new Error('请先在设置中启用网络搜索');
      const effectiveSettings = {
        ...settings,
        provider: settings.tavily_api_key.trim() ? 'tavily' : 'searxng',
      } as BrowserWebSearchSettings;

      const result = await fetchBrowserSearch(query, effectiveSettings);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
}

async function fetchBrowserSearch(query: string, settings: BrowserWebSearchSettings) {
  if (settings.provider === 'tavily') {
    if (!settings.tavily_api_key.trim()) throw new Error('请先填写 Tavily API Key');
    const response = await fetchSearchService('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.tavily_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        search_depth: settings.tavily_search_depth,
        include_answer: settings.tavily_include_answer,
        include_raw_content: false,
        max_results: Math.min(Math.max(settings.tavily_max_results || 5, 1), 20),
      }),
    }, 'Tavily');
    const body = await response.json() as { answer?: string; results?: Array<Record<string, unknown>> };
    if (!response.ok) throw new Error(`Tavily 搜索失败 (${response.status}): ${JSON.stringify(body)}`);
    return {
      provider: 'tavily',
      query,
      answer: body.answer,
      results: (body.results || []).map((item): BrowserWebSearchResult => ({
        title: String(item.title || ''),
        url: String(item.url || ''),
        content: String(item.content || ''),
        score: typeof item.score === 'number' ? item.score : undefined,
      })),
    };
  }

  const base = settings.searxng_url.trim().replace(/\/+$/, '');
  if (!base) throw new Error('请先填写 SearXNG 地址');
  const endpoint = base.endsWith('/search') ? base : `${base}/search`;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(`SearXNG 地址格式无效：${endpoint}`);
  }
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', settings.searxng_language === 'auto' ? 'all' : settings.searxng_language);
  url.searchParams.set('categories', settings.searxng_categories);
  url.searchParams.set('safesearch', String(settings.searxng_safesearch));
  url.searchParams.set('time_range', settings.searxng_time_range);
  const headers: Record<string, string> = {};
  if (settings.searxng_api_key.trim()) headers.Authorization = `Bearer ${settings.searxng_api_key}`;
  const response = await fetchSearchService(url, { headers }, `SearXNG（${endpoint}）`);
  const body = await response.json() as { results?: Array<Record<string, unknown>> };
  if (!response.ok) throw new Error(`SearXNG 搜索失败 (${response.status}): ${JSON.stringify(body)}`);
  const limit = Math.min(Math.max(settings.searxng_max_results || 5, 1), 20);
  return {
    provider: 'searxng',
    query,
    results: (body.results || []).slice(0, limit).map((item): BrowserWebSearchResult => ({
      title: String(item.title || ''),
      url: String(item.url || ''),
      content: String(item.content || item.snippet || ''),
      score: typeof item.score === 'number' ? item.score : undefined,
    })),
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'browser-web-search',
      configureServer: registerBrowserWebSearch,
    },
  ],
  build: {
    chunkSizeWarningLimit: 2500,
  },
})
