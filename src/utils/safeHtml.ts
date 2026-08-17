import DOMPurify from 'dompurify';

const VIDEO_EMBED_HOSTS = new Set([
  'www.youtube-nocookie.com',
  'player.bilibili.com',
  'player.vimeo.com',
]);

export function isAllowedVideoEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && VIDEO_EMBED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Sanitize HTML produced from Markdown before it reaches WebView2 or the PDF
 * renderer. Video iframes are rebuilt only for the small host allowlist used
 * by Preview's explicit @[video](...) extension.
 */
export function sanitizeRenderedHtml(unsafeHtml: string): string {
  const sanitized = DOMPurify.sanitize(unsafeHtml, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base'],
    FORBID_ATTR: ['srcdoc'],
  }) as string;

  const template = document.createElement('template');
  template.innerHTML = sanitized;

  template.content.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((link) => {
    link.rel = 'noopener noreferrer';
  });

  template.content.querySelectorAll<HTMLElement>('figure[data-zeditor-video-src]').forEach((figure) => {
    const src = figure.dataset.zeditorVideoSrc || '';
    figure.removeAttribute('data-zeditor-video-src');
    if (!isAllowedVideoEmbedUrl(src)) return;

    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = figure.dataset.zeditorVideoTitle || 'Video';
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    figure.removeAttribute('data-zeditor-video-title');
    figure.prepend(iframe);
  });

  return template.innerHTML;
}
