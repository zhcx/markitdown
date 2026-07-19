export function parseStoredStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function readStoredStringArray(key: string): string[] {
  try {
    return parseStoredStringArray(localStorage.getItem(key));
  } catch {
    return [];
  }
}

export function writeStoredStringArray(key: string, values: string[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}
