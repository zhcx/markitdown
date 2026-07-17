export interface TextStatistics {
  wordCount: number;
  totalCharacters: number;
}

const chineseCharacterPattern = /\p{Script=Han}/gu;
const englishWordPattern = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

export function calculateTextStatistics(content: string): TextStatistics {
  const chineseCharacters = content.match(chineseCharacterPattern)?.length ?? 0;
  const englishWords = content.match(englishWordPattern)?.length ?? 0;

  return {
    wordCount: chineseCharacters + englishWords,
    totalCharacters: Array.from(content).length,
  };
}

export function formatTextStatistics(content: string): string {
  const { wordCount, totalCharacters } = calculateTextStatistics(content);
  return `${wordCount} 字, ${totalCharacters} 字符`;
}
