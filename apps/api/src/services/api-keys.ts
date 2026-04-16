/**
 * API Key field definitions + lookup helpers.
 * Extracted from index.ts (REL-01 stage 2d, step 2).
 */

import type { StoreData } from '../store/types.js';

export const API_KEY_FIELDS = [
  'mapboxToken', 'maptilerKey', 'geoapifyKey', 'thunderforestKey', 'lumaApiKey',
  'elevenlabsApiKey', 'stableAudioKey', 'audiocraftLocalUrl',
  'groqApiKey', 'tavilyKey', 'braveSearchKey',
] as const;

export type ApiKeyField = typeof API_KEY_FIELDS[number];

export const API_KEY_FLAG_MAP: Record<string, string> = {
  mapboxToken: 'hasMapbox',
  maptilerKey: 'hasMaptiler',
  geoapifyKey: 'hasGeoapify',
  thunderforestKey: 'hasThunderforest',
  lumaApiKey: 'hasLuma',
  elevenlabsApiKey: 'hasElevenlabs',
  stableAudioKey: 'hasStableAudio',
  audiocraftLocalUrl: 'hasAudiocraft',
  groqApiKey: 'hasGroq',
};

/** Read a stored API key value (undefined if unset). */
export function getApiKeyFromStore(store: StoreData, field: string): string | undefined {
  return (((store as unknown as { apiKeys?: Record<string, string> }).apiKeys || {}) as Record<string, string>)[field];
}

/** Build masked payload for GET /api/settings/api-keys response. */
export function buildApiKeysMaskedPayload(store: StoreData): Record<string, string | boolean> {
  const k = ((store as unknown as { apiKeys?: Record<string, string> }).apiKeys || {}) as Record<string, string | undefined>;
  const out: Record<string, string | boolean> = {};
  for (const field of API_KEY_FIELDS) {
    const v = k[field];
    if (field === 'audiocraftLocalUrl') {
      out[field] = v || '';
    } else {
      out[field] = v ? '••••' + String(v).slice(-4) : '';
    }
    out[API_KEY_FLAG_MAP[field]] = !!v;
  }
  return out;
}

/** Apply PUT body (skipping masked placeholders) to (store as unknown as { apiKeys?: Record<string, string> }).apiKeys. */
export function applyApiKeysUpdate(store: StoreData, body: Record<string, string>): void {
  if (!(store as unknown as { apiKeys?: Record<string, string> }).apiKeys) (store as unknown as { apiKeys?: Record<string, string> }).apiKeys = {};
  const ok = (v?: string) => v !== undefined && v !== '' && !v.startsWith('••');
  for (const field of API_KEY_FIELDS) {
    if (ok(body[field])) ((store as unknown as { apiKeys?: Record<string, string> }).apiKeys as Record<string, string>)[field] = body[field];
  }
}

export function isKnownApiKeyField(name: string): boolean {
  return (API_KEY_FIELDS as readonly string[]).includes(name);
}
