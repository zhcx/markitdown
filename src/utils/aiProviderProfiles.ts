import type { AIProviderProfile } from '../stores/appStore';

export function parseAIProviderProfiles(raw: string | null | undefined): Record<string, AIProviderProfile> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, AIProviderProfile>;
  } catch {
    return {};
  }
}
