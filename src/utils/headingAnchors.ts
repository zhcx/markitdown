const CHINESE_DIGITS: Record<string, number> = {
  '零': 0,
  '〇': 0,
  '一': 1,
  '二': 2,
  '两': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
};

const CHINESE_UNITS: Record<string, number> = {
  '十': 10,
  '百': 100,
  '千': 1000,
};

function parseChineseNumber(value: string): number | null {
  let total = 0;
  let digit = 0;
  let recognized = false;

  for (const character of value) {
    if (character in CHINESE_DIGITS) {
      digit = CHINESE_DIGITS[character];
      recognized = true;
      continue;
    }

    const unit = CHINESE_UNITS[character];
    if (!unit) return null;
    total += (digit || 1) * unit;
    digit = 0;
    recognized = true;
  }

  return recognized ? total + digit : null;
}

export function createHeadingAnchorBase(text: string): string {
  const arabicChapter = text.match(/^\s*(\d+)(?=[\s.\u3001\uff0e\uff09):\uff1a-])/);
  if (arabicChapter) return arabicChapter[1];

  const chineseChapter = text.match(/^\s*\u7b2c([\u96f6\u3007\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343]+)[\u7ae0\u8282\u7bc7\u90e8\u5377]/);
  if (chineseChapter) {
    const chapterNumber = parseChineseNumber(chineseChapter[1]);
    if (chapterNumber !== null) return String(chapterNumber);
  }

  return text
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

export function addHeadingAnchors(container: HTMLElement): void {
  const usedIds = new Set(
    Array.from(container.querySelectorAll<HTMLElement>('[id]'))
      .map((element) => element.id)
      .filter(Boolean),
  );

  container.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    if (heading.id) return;
    const base = createHeadingAnchorBase(heading.textContent || '');
    let id = base;
    let duplicate = 2;
    while (usedIds.has(id)) id = `${base}-${duplicate++}`;
    heading.id = id;
    usedIds.add(id);
  });
}

export function findLocalHeadingTarget(container: HTMLElement, href: string): HTMLElement | null {
  if (!href.startsWith('#') || href.length === 1) return null;
  let id: string;
  try {
    id = decodeURIComponent(href.slice(1));
  } catch {
    return null;
  }
  return Array.from(container.querySelectorAll<HTMLElement>('[id]'))
    .find((element) => element.id === id) || null;
}
