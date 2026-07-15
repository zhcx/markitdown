import { useEffect, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useAppStore } from '../../stores/appStore';

interface PreviewProps {
  className?: string;
  style?: React.CSSProperties;
  onScrollContainerReady?: (element: HTMLDivElement | null) => void;
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

export function Preview({ className, style, onScrollContainerReady }: PreviewProps) {
  const containerRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // CSS variables handle normal Markdown theme changes without touching the
  // document tree. Mermaid SVGs bake their own colors, so only those need a
  // refresh when the theme changes.
  const resolvedThemeRef = useRef(document.documentElement.dataset.theme || 'vscode-dark');
  const contentRef = useRef('');
  const [mermaidThemeVersion, setMermaidThemeVersion] = useState(0);
  const { content, settings } = useAppStore();
  const isEmpty = content.trim().length === 0;

  useEffect(() => {
    onScrollContainerReady?.(cardRef.current);
    return () => onScrollContainerReady?.(null);
  }, [onScrollContainerReady]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      resolvedThemeRef.current = (event as CustomEvent<string>).detail;

      // Avoid reparsing the entire preview on every theme switch. A full
      // render remains necessary only when rendered Mermaid SVG needs new
      // theme colors.
      if (/```mermaid(?:\s|$)/i.test(contentRef.current)) {
        setMermaidThemeVersion((version) => version + 1);
      }
    };

    window.addEventListener('markitdown-theme-change', handleThemeChange);
    return () => window.removeEventListener('markitdown-theme-change', handleThemeChange);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

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
          theme: resolvedThemeRef.current.endsWith('-dark') ? 'dark' : 'neutral',
        });
        const { svg } = await mermaid.render('mermaid-' + Date.now(), code);
        const pre = block.parentElement;
        if (!disposed && pre && pre.parentElement) {
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

    return () => {
      disposed = true;
    };
  }, [content, mermaidThemeVersion]);

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
      <div ref={cardRef} className={`preview-card ${isEmpty ? 'is-empty' : ''}`}>
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
