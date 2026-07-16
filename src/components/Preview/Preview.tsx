import { useDeferredValue, useEffect, useRef, useState } from 'react';
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

const renderFormula = (tex: string, displayMode: boolean) => {
  try {
    return katex.renderToString(tex.trim(), { displayMode, throwOnError: false, strict: 'warn', trust: false });
  } catch {
    return displayMode ? `$$${tex}$$` : `$${tex}$`;
  }
};

// Keep code fences and inline code intact so their dollar signs are never
// interpreted as formulas.
const renderMath = (source: string) => source
  .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
  .map((segment, index) => {
    if (index % 2 === 1) return segment;
    return segment.split(/(`[^`\n]*`)/g).map((part, partIndex) => {
      if (partIndex % 2 === 1) return part;
      return part
        .replace(/(^|\n)\$\$\s*([\s\S]*?)\s*\$\$(?=\n|$)/g, (_, prefix, tex) => `${prefix}<div class="katex-block">${renderFormula(tex, true)}</div>`)
        .replace(/(^|\n)\\\[\s*([\s\S]*?)\s*\\\](?=\n|$)/g, (_, prefix, tex) => `${prefix}<div class="katex-block">${renderFormula(tex, true)}</div>`)
        .replace(/\\\((.+?)\\\)/g, (_, tex) => renderFormula(tex, false))
        .replace(/(^|[^\\$])\$([^$\n]+?)\$(?!\$)/g, (_, prefix, tex) => `${prefix}${renderFormula(tex, false)}`);
    }).join('');
  }).join('');

export function Preview({ className, style, onScrollContainerReady }: PreviewProps) {
  const containerRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // CSS variables handle normal Markdown theme changes without touching the
  // document tree. Mermaid SVGs bake their own colors, so only those need a
  // refresh when the theme changes.
  const resolvedThemeRef = useRef(document.documentElement.dataset.theme || 'vscode-dark');
  const contentRef = useRef('');
  const mermaidSequenceRef = useRef(0);
  const [mermaidThemeVersion, setMermaidThemeVersion] = useState(0);
  const { content, settings } = useAppStore();
  // Markdown parsing, syntax highlighting and diagrams can be expensive for a
  // long document. Keep the editor on the urgent update path and let preview
  // work yield to typing.
  const deferredContent = useDeferredValue(content);
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

    const rendered = md.render(renderMath(deferredContent));
    containerRef.current.innerHTML = rendered;

    // Mermaid is imported and rendered only when a diagram is close to the
    // visible preview. A long document can therefore contain many diagrams
    // without blocking initial render or editor input.
    const mermaidBlocks = containerRef.current.querySelectorAll('code.language-mermaid');
    const renderMermaid = async (block: Element) => {
      const code = block.textContent || '';
      try {
        // Dynamic import mermaid
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedThemeRef.current.endsWith('-dark') ? 'dark' : 'neutral',
        });
        const { svg } = await mermaid.render(`mermaid-${Date.now()}-${mermaidSequenceRef.current++}`, code);
        const pre = block.parentElement;
        if (!disposed && pre && pre.parentElement) {
          pre.parentElement.innerHTML = `<figure class="mermaid-container"><figcaption>Mermaid 图表</figcaption>${svg}</figure>`;
        }
      } catch (e) {
        console.error('Mermaid render error:', e);
        const pre = block.parentElement;
        if (!disposed && pre?.parentElement) {
          pre.parentElement.innerHTML = `<div class="mermaid-error"><strong>图表语法错误</strong><pre>${md.utils.escapeHtml(code)}</pre></div>`;
        }
      }
    };

    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer?.unobserve(entry.target);
        void renderMermaid(entry.target);
      });
    }, { root: cardRef.current, rootMargin: '480px 0px' });

    mermaidBlocks.forEach((block) => {
      if (observer) observer.observe(block);
      else void renderMermaid(block);
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
      observer?.disconnect();
    };
  }, [deferredContent, mermaidThemeVersion]);

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
