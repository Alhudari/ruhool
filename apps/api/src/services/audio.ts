import fs from 'node:fs';
import path from 'node:path';

/**
 * Audio service: ElevenLabs TTS/SFX + Stable Audio music.
 * Extracted from index.ts (REL-01 stage 2d, step 1).
 *
 * Factory pattern — routes take these via args, no globals.
 */

export const FALLBACK_ELEVENLABS_VOICE = 'nPczCjzI2devNBz1zQrb'; // Brian (male, multilingual)

export const VOICE_SAMPLES_DIR = path.resolve(import.meta.dirname || '.', '../../../data/voice-samples');
fs.mkdirSync(VOICE_SAMPLES_DIR, { recursive: true });

/** Base sample text — always the same first part */
export const SAMPLE_BASE = 'مرحبا .. أنا أتكلم الفصحى .. وأقدر أتكلم كويتي لو تبي ، بالتوفيق وفمان الله';

export type CaptionStyleSubset = {
  preset: 'tiktok-yellow' | 'clean-white' | 'neon-pink' | 'karaoke';
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  background?: string;
  position?: 'bottom' | 'center' | 'top';
  wordHighlight?: boolean;
};

export const STYLE_PRESETS: Record<string, Partial<CaptionStyleSubset & { fontSize: number; color: string; strokeColor: string; strokeWidth: number; background: string; position: string }>> = {
  'tiktok-yellow': { fontSize: 72, color: '#FFEB3B', strokeColor: '#000000', strokeWidth: 4, background: 'none', position: 'center' },
  'clean-white':   { fontSize: 56, color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 3, background: 'none', position: 'bottom' },
  'neon-pink':     { fontSize: 68, color: '#FF2D95', strokeColor: '#FFFFFF', strokeWidth: 3, background: 'none', position: 'center' },
  'karaoke':       { fontSize: 64, color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 3, background: 'rgba(0,0,0,0.6)', position: 'bottom', wordHighlight: true },
};

/** Per-accent tail appended to SAMPLE_BASE. */
export function accentTailFor(accent: string): string {
  const a = (accent || '').toLowerCase();
  if (a.includes('egypt') || a.includes('مصر')) return ' .. وبأدر أتكلم مصري لو حابب';
  if (a.includes('saudi') || a.includes('سعودي')) return ' .. وأقدر أتكلم نجدي لو تبي';
  if (a.includes('leban') || a.includes('لبنان')) return ' .. وفيني إحكي لبناني إذا بدّك';
  if (a.includes('moroc') || a.includes('مغرب')) return ' .. وكنقدر نهضر بالدارجة المغربية';
  if (a.includes('iraq') || a.includes('عراق')) return ' .. وأكدر أحجي عراقي إذا تريد';
  if (a.includes('emirat') || a.includes('إمارات')) return ' .. وأقدر أتكلم إماراتي لو تحب';
  if (a.includes('british') || a.includes('uk')) return '. And I can speak with a British accent.';
  if (a.includes('american') || a.includes('us')) return '. And I can speak with an American accent.';
  if (a.includes('aussie') || a.includes('austral')) return '. And I can speak with an Australian accent.';
  return '';
}

/** Soften Arabic dialect pronunciation based on hints. */
export function applyDialectPronunciation(text: string, hints?: string): string {
  const h = (hints || '').toLowerCase();
  let out = text;
  if (h.includes('kuwait') || h.includes('gulf') || h.includes('كويت') || h.includes('خليجي')) {
    out = out.replace(/\bالله\b/g, 'اللَه');
  }
  if (h.includes('egypt') || h.includes('مصر')) {
    out = out.replace(/\bأقدر\b/g, 'أقْدَر');
  }
  return out;
}

export interface AudioServiceDeps {
  /** Look up a stored API key by field name (e.g. 'elevenlabsApiKey'). */
  getApiKey: (field: string) => string | undefined;
  /** Current default voice ID (from voice preferences or fallback). */
  getDefaultVoiceId: () => string;
}

export interface AudioService {
  elevenlabsTTS: (text: string, voiceId?: string, pronunciationHints?: string) => Promise<Buffer | null>;
  elevenlabsSFX: (description: string, durationSec?: number) => Promise<Buffer | null>;
  stableAudioMusic: (prompt: string, durationSec: number) => Promise<Buffer | null>;
  getDefaultVoiceId: () => string;
  FALLBACK_ELEVENLABS_VOICE: string;
  VOICE_SAMPLES_DIR: string;
  SAMPLE_BASE: string;
  STYLE_PRESETS: typeof STYLE_PRESETS;
  accentTailFor: typeof accentTailFor;
  applyDialectPronunciation: typeof applyDialectPronunciation;
}

export function createAudioService(deps: AudioServiceDeps): AudioService {
  const { getApiKey, getDefaultVoiceId } = deps;

  async function elevenlabsTTS(text: string, voiceId?: string, pronunciationHints?: string): Promise<Buffer | null> {
    const key = getApiKey('elevenlabsApiKey');
    if (!key) return null;
    const vid = voiceId || getDefaultVoiceId();
    const processedText = applyDialectPronunciation(text, pronunciationHints);
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: processedText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch { return null; }
  }

  async function elevenlabsSFX(description: string, durationSec?: number): Promise<Buffer | null> {
    const key = getApiKey('elevenlabsApiKey');
    if (!key) return null;
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: description,
          duration_seconds: durationSec || undefined,
          prompt_influence: 0.35,
        }),
      });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch { return null; }
  }

  async function stableAudioMusic(prompt: string, durationSec: number): Promise<Buffer | null> {
    const key = getApiKey('stableAudioKey');
    if (!key) return null;
    try {
      const res = await fetch('https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, accept: 'audio/*' },
        body: (() => {
          const fd = new FormData();
          fd.append('prompt', prompt);
          fd.append('duration', String(Math.min(47, Math.max(1, durationSec))));
          fd.append('output_format', 'mp3');
          return fd;
        })(),
      });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch { return null; }
  }

  return {
    elevenlabsTTS,
    elevenlabsSFX,
    stableAudioMusic,
    getDefaultVoiceId,
    FALLBACK_ELEVENLABS_VOICE,
    VOICE_SAMPLES_DIR,
    SAMPLE_BASE,
    STYLE_PRESETS,
    accentTailFor,
    applyDialectPronunciation,
  };
}
