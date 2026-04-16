/**
 * Audio generation service — Phase 5.
 *
 * Thin wrapper around the existing `AudioService` (ElevenLabs TTS/SFX +
 * Stable Audio music). Persists bytes under `data/audio/generated/` and
 * returns dashboard-friendly `/api/files/audio/generated/<filename>` URLs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type { AudioService } from '../audio.js';

export class NoAudioProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoAudioProviderError';
  }
}

export interface GenerationAudioLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
  error?: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface GenerationAudioDeps {
  audioService: Pick<AudioService, 'elevenlabsTTS' | 'elevenlabsSFX' | 'stableAudioMusic' | 'getDefaultVoiceId'>;
  logger?: GenerationAudioLogger;
  dataDir?: string;
}

export interface GenerateAudioResult {
  url: string;
  meta: {
    kind: 'tts' | 'music' | 'sfx';
    provider: string;
    durationMs: number;
    bytes: number;
    filename: string;
    specialist: string;
    voice?: string;
    durationSec?: number;
  };
}

export interface GenerationAudioService {
  generateTTS(params: { prompt: string; voice?: string; specialist: string }): Promise<GenerateAudioResult>;
  generateMusic(params: { prompt: string; durationSec?: number; specialist: string }): Promise<GenerateAudioResult>;
  generateSFX(params: { prompt: string; durationSec?: number; specialist: string }): Promise<GenerateAudioResult>;
  outputDir: string;
}

export function createGenerationAudioService(deps: GenerationAudioDeps): GenerationAudioService {
  const dataDir = deps.dataDir ?? path.resolve(import.meta.dirname || '.', '../../../../data');
  const outputDir = path.join(dataDir, 'audio', 'generated');
  fs.mkdirSync(outputDir, { recursive: true });

  function shortId(): string {
    return crypto.randomBytes(4).toString('hex');
  }

  function writeFile(bytes: Buffer, ext: string): string {
    const filename = `${Date.now()}-${shortId()}.${ext}`;
    fs.writeFileSync(path.join(outputDir, filename), bytes);
    return filename;
  }

  async function generateTTS(params: { prompt: string; voice?: string; specialist: string }): Promise<GenerateAudioResult> {
    const started = Date.now();
    const bytes = await deps.audioService.elevenlabsTTS(params.prompt, params.voice);
    if (!bytes) throw new NoAudioProviderError('TTS unavailable: elevenlabsApiKey missing or request failed');
    const filename = writeFile(bytes, 'mp3');
    const durationMs = Date.now() - started;
    deps.logger?.info?.(
      { specialist: params.specialist, kind: 'tts', provider: 'elevenlabs', durationMs, bytes: bytes.length },
      'audio.generate',
    );
    return {
      url: `/api/files/audio/generated/${filename}`,
      meta: { kind: 'tts', provider: 'elevenlabs', durationMs, bytes: bytes.length, filename, specialist: params.specialist, voice: params.voice },
    };
  }

  async function generateMusic(params: { prompt: string; durationSec?: number; specialist: string }): Promise<GenerateAudioResult> {
    const started = Date.now();
    const bytes = await deps.audioService.stableAudioMusic(params.prompt, params.durationSec ?? 20);
    if (!bytes) throw new NoAudioProviderError('music unavailable: stableAudioKey missing or request failed');
    const filename = writeFile(bytes, 'mp3');
    const durationMs = Date.now() - started;
    deps.logger?.info?.(
      { specialist: params.specialist, kind: 'music', provider: 'stability', durationMs, bytes: bytes.length },
      'audio.generate',
    );
    return {
      url: `/api/files/audio/generated/${filename}`,
      meta: { kind: 'music', provider: 'stability', durationMs, bytes: bytes.length, filename, specialist: params.specialist, durationSec: params.durationSec },
    };
  }

  async function generateSFX(params: { prompt: string; durationSec?: number; specialist: string }): Promise<GenerateAudioResult> {
    const started = Date.now();
    const bytes = await deps.audioService.elevenlabsSFX(params.prompt, params.durationSec);
    if (!bytes) throw new NoAudioProviderError('SFX unavailable: elevenlabsApiKey missing or request failed');
    const filename = writeFile(bytes, 'mp3');
    const durationMs = Date.now() - started;
    deps.logger?.info?.(
      { specialist: params.specialist, kind: 'sfx', provider: 'elevenlabs', durationMs, bytes: bytes.length },
      'audio.generate',
    );
    return {
      url: `/api/files/audio/generated/${filename}`,
      meta: { kind: 'sfx', provider: 'elevenlabs', durationMs, bytes: bytes.length, filename, specialist: params.specialist, durationSec: params.durationSec },
    };
  }

  return { generateTTS, generateMusic, generateSFX, outputDir };
}
