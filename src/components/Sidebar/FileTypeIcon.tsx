import { resolveFileIcon, type FileIconShape } from '../../utils/fileIcon';

function IconGlyph({ shape, label }: { shape: FileIconShape; label?: string }) {
  switch (shape) {
    case 'markdown':
      return <><path d="M2.4 5.2h15.2v9.6H2.4z" className="file-glyph-outline" /><path d="M4.5 12V8l2.15 2.3L8.8 8v4M12.2 8.1v3.35m-1.35-1.3 1.35 1.45 1.35-1.45" className="file-glyph-detail" /></>;
    case 'brace':
      return <text x="10" y="13.25" textAnchor="middle" className="file-glyph-language file-glyph-brace">{'{ }'}</text>;
    case 'code':
      return <path d="m7.6 5.8-4 4.2 4 4.2M12.4 5.8l4 4.2-4 4.2M11.4 4.8 8.7 15.2" className="file-glyph-outline" />;
    case 'config':
      return <><circle cx="10" cy="10" r="2.4" className="file-glyph-outline" /><path d="M10 3.1v2M10 14.9v2M3.1 10h2M14.9 10h2M5.1 5.1l1.4 1.4M13.5 13.5l1.4 1.4M14.9 5.1l-1.4 1.4M6.5 13.5l-1.4 1.4" className="file-glyph-outline" /></>;
    case 'git':
      return <><path d="m10 2.8 7.2 7.2-7.2 7.2L2.8 10z" className="file-glyph-solid" /><circle cx="8" cy="7.2" r="1" className="file-glyph-cutout" /><circle cx="12.2" cy="12.8" r="1" className="file-glyph-cutout" /><path d="M8 8.2v2.1c0 1.4 1.2 2.5 2.6 2.5h.6M8 9.4l2-2" className="file-glyph-cutout-stroke" /></>;
    case 'docker':
      return <><path d="M3 9.3h12.5c-.2 3.6-2.4 6-6.3 6-3.2 0-5.4-1.6-6.2-4.2m12.4-1.8c.8-.1 1.3-.6 1.6-1.3.6.4.9 1 .8 1.7-.9.4-1.7.5-2.4.4" className="file-glyph-outline" /><path d="M5 6.5h2v2H5zm2.6 0h2v2h-2zm2.6 0h2v2h-2zM7.6 3.9h2v2h-2zm2.6 0h2v2h-2" className="file-glyph-solid" /></>;
    case 'image':
      return <><rect x="2.8" y="3.1" width="14.4" height="13.8" rx="1.6" className="file-glyph-outline" /><circle cx="12.9" cy="7.2" r="1.45" className="file-glyph-solid" /><path d="m4.8 14.8 3.55-4 2.3 2.35 1.55-1.6 3 3.25" className="file-glyph-outline" /></>;
    case 'audio':
      return <><path d="M8.2 14.2V5.8l7-1.5v8" className="file-glyph-outline" /><ellipse cx="6.2" cy="14.5" rx="2" ry="1.55" className="file-glyph-solid" /><ellipse cx="13.2" cy="12.4" rx="2" ry="1.55" className="file-glyph-solid" /></>;
    case 'video':
      return <><rect x="2.7" y="4" width="14.6" height="12" rx="2" className="file-glyph-outline" /><path d="m8.1 7.1 5 2.9-5 2.9z" className="file-glyph-solid" /></>;
    case 'archive':
      return <><path d="M4 3h12v14H4z" className="file-glyph-outline" /><path d="M9 3h2v2H9zm2 2h2v2h-2M9 7h2v2H9zm2 2h2v2h-2M9 11h2v2H9zm1 2h3v2.5h-3z" className="file-glyph-solid" /></>;
    case 'office':
      return <><rect x="2.7" y="2.7" width="14.6" height="14.6" rx="2.7" className="file-glyph-solid" /><text x="10" y="12.7" textAnchor="middle" className="file-glyph-knockout">{label}</text></>;
    case 'sheet':
      return <><rect x="2.7" y="2.7" width="14.6" height="14.6" rx="2.7" className="file-glyph-solid" /><path d="M7.2 3v14M12.4 3v14M3 7.3h14M3 12.4h14" className="file-glyph-grid" /><text x="7.3" y="12.8" textAnchor="middle" className="file-glyph-knockout">{label}</text></>;
    case 'terminal':
      return <><rect x="2.4" y="3.4" width="15.2" height="13.2" rx="2" className="file-glyph-outline" /><path d="m5.2 7 2.7 2.5L5.2 12M9.8 12.2h4.5" className="file-glyph-outline" /></>;
    case 'database':
      return <><ellipse cx="10" cy="5.1" rx="6.2" ry="2.5" className="file-glyph-outline" /><path d="M3.8 5.1v4.8c0 1.4 2.8 2.5 6.2 2.5s6.2-1.1 6.2-2.5V5.1M3.8 9.9v4.7c0 1.4 2.8 2.5 6.2 2.5s6.2-1.1 6.2-2.5V9.9" className="file-glyph-outline" /></>;
    case 'notebook':
      return <><path d="M5 2.8h10.4v14.4H5zM3.2 5.5h3M3.2 9.9h3M3.2 14.3h3" className="file-glyph-outline" /><path d="m8.1 8.2-1.5 1.7 1.5 1.7M12.2 8.2l1.5 1.7-1.5 1.7M11.1 7.6l-1.8 4.7" className="file-glyph-outline" /></>;
    case 'package':
      return <><path d="m10 2.7 6.3 3.4v7.7L10 17.3l-6.3-3.5V6.1zM3.7 6.1 10 9.6l6.3-3.5M10 9.6v7.7M6.8 4.4l6.4 3.5v2.4" className="file-glyph-outline" /></>;
    case 'lock':
      return <><rect x="3.5" y="8.3" width="13" height="8.7" rx="1.8" className="file-glyph-solid" /><path d="M6.2 8.3V6.5a3.8 3.8 0 0 1 7.6 0v1.8" className="file-glyph-outline" /><circle cx="10" cy="12.2" r="1.25" className="file-glyph-cutout" /><path d="M10 13.2v1.6" className="file-glyph-cutout-stroke" /></>;
    case 'book':
      return <path d="M3.2 3.4h5.1c1 0 1.7.5 1.7 1.4v11.8c0-.9-.7-1.4-1.7-1.4H3.2zM16.8 3.4h-5.1c-1 0-1.7.5-1.7 1.4v11.8c0-.9.7-1.4 1.7-1.4h5.1z" className="file-glyph-outline" />;
    case 'mail':
      return <><rect x="2.5" y="4" width="15" height="12" rx="1.8" className="file-glyph-outline" /><path d="m3.2 5.3 6.8 5.5 6.8-5.5M3.2 14.7l4.7-4M16.8 14.7l-4.7-4" className="file-glyph-outline" /></>;
    case 'font':
      return <><text x="9.5" y="14.7" textAnchor="middle" className="file-glyph-language file-glyph-font">Aa</text><path d="M3.1 4h13.8" className="file-glyph-outline" /></>;
    case 'binary':
      return <><path d="M4 2.8h8l4 4v10.4H4zM12 2.8v4h4" className="file-glyph-outline" /><text x="10" y="14" textAnchor="middle" className="file-glyph-binary">01</text></>;
    case 'document':
      return <><path d="M4.2 2.5h7.5l4.1 4.1v10.9H4.2zM11.7 2.5v4.1h4.1" className="file-glyph-outline" /><path d="M7 10h6M7 12.5h6M7 15h4.3" className="file-glyph-outline file-glyph-lines" /></>;
    case 'language':
    default:
      return <text x="10" y="13.4" textAnchor="middle" className={`file-glyph-language ${(label?.length || 0) > 2 ? 'long' : ''}`}>{label}</text>;
  }
}

export function FileTypeIcon({ filename }: { filename: string }) {
  const icon = resolveFileIcon(filename);
  return (
    <svg className={`explorer-icon file-icon vscode-file-icon file-kind-${icon.kind}`} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <IconGlyph shape={icon.shape} label={icon.label} />
    </svg>
  );
}
