export type ExportTemplateId = 'wechat' | 'academic' | 'official' | 'technical' | 'slides' | 'xiaohongshu' | 'a4' | 'github' | 'custom';

export interface ExportTemplate {
  id: ExportTemplateId;
  label: string;
  font: string;
  margin: number;
  lineHeight: number;
  codeTheme: 'dark' | 'light';
  mermaidTheme: 'default' | 'neutral' | 'dark';
  titleNumbering: boolean;
  toc: boolean;
  cover: boolean;
  headerFooter: boolean;
  watermark: string;
  customCss: string;
}

export const EXPORT_TEMPLATES: ExportTemplate[] = [
  { id: 'wechat', label: '公众号文章', font: 'Microsoft YaHei, sans-serif', margin: 22, lineHeight: 1.9, codeTheme: 'dark', mermaidTheme: 'default', titleNumbering: false, toc: false, cover: true, headerFooter: false, watermark: '', customCss: '' },
  { id: 'academic', label: '学术论文', font: 'SimSun, serif', margin: 25, lineHeight: 1.75, codeTheme: 'light', mermaidTheme: 'neutral', titleNumbering: true, toc: true, cover: true, headerFooter: true, watermark: '', customCss: '' },
  { id: 'official', label: '公文排版', font: 'FangSong, STFangsong, serif', margin: 28, lineHeight: 1.8, codeTheme: 'light', mermaidTheme: 'neutral', titleNumbering: true, toc: false, cover: false, headerFooter: true, watermark: '', customCss: '' },
  { id: 'technical', label: '技术文档', font: 'Inter, Microsoft YaHei, sans-serif', margin: 20, lineHeight: 1.65, codeTheme: 'dark', mermaidTheme: 'dark', titleNumbering: true, toc: true, cover: false, headerFooter: true, watermark: '', customCss: '' },
  { id: 'slides', label: '演示长图', font: 'Microsoft YaHei, sans-serif', margin: 16, lineHeight: 1.55, codeTheme: 'dark', mermaidTheme: 'dark', titleNumbering: false, toc: false, cover: true, headerFooter: false, watermark: '', customCss: '' },
  { id: 'xiaohongshu', label: '小红书长图', font: 'Microsoft YaHei, sans-serif', margin: 18, lineHeight: 1.75, codeTheme: 'dark', mermaidTheme: 'default', titleNumbering: false, toc: false, cover: true, headerFooter: false, watermark: '', customCss: '' },
  { id: 'a4', label: 'A4 打印', font: 'SimSun, serif', margin: 20, lineHeight: 1.7, codeTheme: 'light', mermaidTheme: 'neutral', titleNumbering: true, toc: true, cover: false, headerFooter: true, watermark: '', customCss: '' },
  { id: 'github', label: 'GitHub README', font: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', margin: 18, lineHeight: 1.55, codeTheme: 'dark', mermaidTheme: 'default', titleNumbering: false, toc: false, cover: false, headerFooter: false, watermark: '', customCss: '' },
  { id: 'custom', label: '自定义 CSS', font: 'Microsoft YaHei, sans-serif', margin: 20, lineHeight: 1.7, codeTheme: 'dark', mermaidTheme: 'default', titleNumbering: false, toc: false, cover: false, headerFooter: false, watermark: '', customCss: '' },
];

export const getExportTemplate = (id: ExportTemplateId): ExportTemplate => ({ ...(EXPORT_TEMPLATES.find((template) => template.id === id) || EXPORT_TEMPLATES[0]) });
export const loadExportTemplate = () => { try { return getExportTemplate((localStorage.getItem('markitdown.export-template') || 'wechat') as ExportTemplateId); } catch { return getExportTemplate('wechat'); } };
export const saveExportTemplate = (template: ExportTemplate) => localStorage.setItem('markitdown.export-template', template.id);

export function applyExportTemplate(html: string, title: string, template: ExportTemplate) {
  const headings = [...html.matchAll(/<h([1-3])[^>]*>(.*?)<\/h\1>/g)].map((heading) => `<li>${heading[2].replace(/<[^>]+>/g, '')}</li>`).join('');
  const cover = template.cover ? `<section class="export-cover"><h1>${title}</h1><p>MarkItDown 导出文档</p></section>` : '';
  const toc = template.toc && headings ? `<nav class="export-toc"><strong>目录</strong><ol>${headings}</ol></nav>` : '';
  const watermark = template.watermark ? `<div class="export-watermark">${template.watermark}</div>` : '';
  const footer = template.headerFooter ? `<footer class="export-footer"><span>${title}</span><span>第 <span class="page-number">页</span></span></footer>` : '';
  const numbering = template.titleNumbering ? `.export-document{counter-reset:h1}.export-document h1{counter-reset:h2}.export-document h2{counter-reset:h3}.export-document h1:before{counter-increment:h1;content:counter(h1) '. '}.export-document h2:before{counter-increment:h2;content:counter(h1) '.' counter(h2) ' '}.export-document h3:before{counter-increment:h3;content:counter(h1) '.' counter(h2) '.' counter(h3) ' '}` : '';
  const css = `body{font-family:${template.font};font-size:16px;line-height:${template.lineHeight};margin:0;color:#24292f} .export-document{max-width:900px;margin:auto;padding:${template.margin}mm;position:relative}.export-document h1{margin:1.55em 0 .7em;font-size:28px;line-height:1.3}.export-document h2{margin:1.4em 0 .65em;font-size:22px;line-height:1.35}.export-document h3{margin:1.25em 0 .55em;font-size:18px;line-height:1.4}.export-document h4,.export-document h5,.export-document h6{font-size:16px;line-height:1.45}.export-document p{margin:.7em 0}.export-document small{font-size:13px}.export-document table{font-size:14px}.export-document pre{padding:14px;border-radius:8px;overflow:auto;background:${template.codeTheme === 'dark' ? '#1f2937' : '#f6f8fa'};color:${template.codeTheme === 'dark' ? '#f9fafb' : '#24292f'};font-size:13px;line-height:1.6}.export-document code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em}.export-cover{min-height:60vh;display:grid;place-content:center;text-align:center;page-break-after:always}.export-cover h1{font-size:32px}.export-toc{page-break-after:always;padding:16px;border:1px solid #d0d7de;border-radius:8px}.export-watermark{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;opacity:.08;font-size:52px;transform:rotate(-28deg)}.export-footer{display:flex;justify-content:space-between;margin-top:32px;padding-top:12px;border-top:1px solid #d0d7de;font-size:12px;color:#57606a}.page-number:after{content:counter(page)}@page{margin:${template.margin}mm}${numbering}${template.customCss}`;
  return `<style>${css}</style><main class="export-document" data-mermaid-theme="${template.mermaidTheme}">${watermark}${cover}${toc}${html}${footer}</main>`;
}
