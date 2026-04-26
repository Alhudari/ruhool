import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGenerationAudioService, NoAudioProviderError } from './audio.js';

function makeAudioServiceStub(result: Buffer | null) {
  return {
    elevenlabsTTS: vi.fn(async () => result),
    elevenlabsSFX: vi.fn(async () => result),
    stableAudioMusic: vi.fn(async () => result),
    getDefaultVoiceId: () => 'voice-id',
  };
}

describe('generation/audio', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruhool-aud-')); });
  afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('TTS writes MP3 and returns /api/files URL', async () => {
    const mp3 = Buffer.from('ID3fake-tts');
    const svc = createGenerationAudioService({ audioService: makeAudioServiceStub(mp3), dataDir: tmpDir });
    const res = await svc.generateTTS({ prompt: 'مرحبا', specialist: 'المبدع' });
    expect(res.url).toMatch(/^\/api\/files\/audio\/generated\/.+\.mp3$/);
    expect(res.meta.kind).toBe('tts');
    expect(res.meta.bytes).toBe(mp3.length);
    const onDisk = path.join(tmpDir, 'audio', 'generated', res.meta.filename);
    expect(fs.existsSync(onDisk)).toBe(true);
  });

  it('Music + SFX paths also produce URLs', async () => {
    const mp3 = Buffer.from('music');
    const svc = createGenerationAudioService({ audioService: makeAudioServiceStub(mp3), dataDir: tmpDir });
    const music = await svc.generateMusic({ prompt: 'calm piano', specialist: 'المصمم', durationSec: 15 });
    const sfx = await svc.generateSFX({ prompt: 'door knock', specialist: 'المصمم' });
    expect(music.meta.kind).toBe('music');
    expect(sfx.meta.kind).toBe('sfx');
  });

  it('throws NoAudioProviderError when underlying service returns null', async () => {
    const svc = createGenerationAudioService({ audioService: makeAudioServiceStub(null), dataDir: tmpDir });
    await expect(svc.generateTTS({ prompt: 'x', specialist: 'المصمم' })).rejects.toBeInstanceOf(NoAudioProviderError);
  });
});
