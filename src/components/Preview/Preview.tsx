import { useEffect, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useAppStore } from '../../stores/appStore';

interface PreviewProps {
  className?: string;
  style?: React.CSSProperties;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      } catch {
        // ignore
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

export function Preview({ className, style }: PreviewProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [resolvedTheme, setResolvedTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const { content, settings } = useAppStore();
  const isEmpty = content.trim().length === 0;

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      setResolvedTheme((event as CustomEvent<string>).detail);
    };

    window.addEventListener('markitdown-theme-change', handleThemeChange);
    return () => window.removeEventListener('markitdown-theme-change', handleThemeChange);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Process math formulas
    let processedContent = content;

    // Block math: $$...$$
    processedContent = processedContent.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      try {
        return `<div class="katex-block">${katex.renderToString(tex, {
          displayMode: true,
          throwOnError: false,
        })}</div>`;
      } catch {
        return `$$${tex}$$`;
      }
    });

    // Inline math: $...$
    processedContent = processedContent.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
      try {
        return katex.renderToString(tex, {
          displayMode: false,
          throwOnError: false,
        });
      } catch {
        return `$${tex}$`;
      }
    });

    const rendered = md.render(processedContent);
    containerRef.current.innerHTML = rendered;

    // Render Mermaid diagrams
    const mermaidBlocks = containerRef.current.querySelectorAll('code.language-mermaid');
    mermaidBlocks.forEach(async (block) => {
      const code = block.textContent || '';
      try {
        // Dynamic import mermaid
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === 'dark' ? 'dark' : 'neutral',
        });
        const { svg } = await mermaid.render('mermaid-' + Date.now(), code);
        const pre = block.parentElement;
        if (pre && pre.parentElement) {
          pre.parentElement.innerHTML = svg;
        }
      } catch (e) {
        console.error('Mermaid render error:', e);
      }
    });

    // Handle image clicks for upload
    const images = containerRef.current.querySelectorAll('img');
    images.forEach((img) => {
      img.addEventListener('click', () => {
        img.setAttribute('data-src', img.src);
      });
    });
  }, [content, resolvedTheme]);

  const containerStyle: React.CSSProperties = {
    fontFamily: settings.appearance.font_family,
    fontSize: settings.appearance.font_size,
    lineHeight: settings.appearance.line_height,
  };

  return (
    <div
      className={`preview-container ${className || ''}`}
      style={{ ...containerStyle, ...style }}
    >
      <div className={`preview-card ${isEmpty ? 'is-empty' : ''}`}>
        <article ref={containerRef} className="preview-document" />
        {isEmpty && (
          <div className="preview-empty-state">
            <span className="preview-empty-mark" aria-hidden="true">↗</span>
            <strong>预览将在这里显示</strong>
            <span>开始写作后，这里会呈现舒适的阅读排版。</span>
          </div>
        )}
      </div>
    </div>
  );
}
