import type { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import type { StoreData } from '../store/types.js';
import type { AudioService } from '../services/audio.js';

export interface VoiceRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  getApiKey: (field: string) => string | undefined;
  audio: AudioService;
}

type AudioSegment = {
  startSec: number;
  endSec: number;
  kind: 'voice' | 'sfx' | 'music';
  text: string;
  voiceId?: string;
  volume?: number;
  dialect?: string;
};

type AudioPlan = {
  enabled: boolean;
  backend: 'elevenlabs' | 'stableaudio' | 'audiocraft';
  segments: AudioSegment[];
};

/**
 * Voice + audio preview routes.
 * Extracted from index.ts (REL-01 stage 2d, step voice).
 *
 * Covers:
 *   /api/settings/voice (GET, PUT)
 *   /api/audio/voices   (GET)
 *   /api/voice/clone    (POST, DELETE /:voiceId)
 *   /api/voice/mine     (GET)
 *   /api/audio/voice-sample/:voiceId  (GET, DELETE)
 *   /api/audio/voice-samples/status   (GET)
 *   /api/audio/tts / sfx / music / plan/suggest  (POST)
 */
export function registerVoiceRoutes(app: Hono, deps: VoiceRoutesDeps): void {
  const { getStore, saveStore, getApiKey, audio } = deps;
  const { elevenlabsTTS, elevenlabsSFX, stableAudioMusic, FALLBACK_ELEVENLABS_VOICE, VOICE_SAMPLES_DIR, SAMPLE_BASE, accentTailFor } = audio;

  app.get('/api/settings/voice', (c) => {
    const store = getStore();
    const prefs = ((store as unknown as { voicePreferences?: { elevenlabsVoiceId?: string } }).voicePreferences || {});
    return c.json({ elevenlabsVoiceId: prefs.elevenlabsVoiceId || FALLBACK_ELEVENLABS_VOICE });
  });

  app.put('/api/settings/voice', async (c) => {
    const store = getStore();
    const body = await c.req.json<{ elevenlabsVoiceId: string }>();
    if (!body.elevenlabsVoiceId) return c.json({ error: 'voiceId required' }, 400);
    const s = store as unknown as { voicePreferences?: { elevenlabsVoiceId?: string } };
    if (!s.voicePreferences) s.voicePreferences = {};
    s.voicePreferences.elevenlabsVoiceId = body.elevenlabsVoiceId;
    saveStore();
    return c.json({ ok: true });
  });

  // List ElevenLabs voices
  app.get('/api/audio/voices', async (c) => {
    const key = getApiKey('elevenlabsApiKey');
    if (!key) return c.json({ error: 'ElevenLabs key required' }, 400);
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
      if (!r.ok) return c.json({ error: `HTTP ${r.status}` }, 502);
      const data = await r.json() as { voices: Array<{ voice_id: string; name: string; category: string; labels?: Record<string, string>; preview_url?: string; description?: string }> };
      const voices = data.voices.map((v) => ({
        voiceId: v.voice_id,
        name: v.name,
        category: v.category,
        gender: v.labels?.gender || v.labels?.Gender || 'unknown',
        accent: v.labels?.accent || v.labels?.language || '',
        age: v.labels?.age || '',
        description: v.description || '',
        previewUrl: v.preview_url || null,
      }));
      return c.json({ voices });
    } catch (e) {
      return c.json({ error: String(e).slice(0, 200) }, 500);
    }
  });

  // Voice cloning via ElevenLabs
  app.post('/api/voice/clone', async (c) => {
    const store = getStore();
    const key = getApiKey('elevenlabsApiKey');
    if (!key) return c.json({ error: 'ElevenLabs key required' }, 400);
    try {
      const form = await c.req.formData();
      const name = (form.get('name') as string) || 'My Voice';
      const description = (form.get('description') as string) || 'Cloned via Ruhool';
      const files = form.getAll('files').filter((f) => f instanceof File) as File[];
      if (files.length < 1) return c.json({ error: 'At least one audio file required (recommended 3)' }, 400);

      const upstream = new FormData();
      upstream.append('name', name);
      upstream.append('description', description);
      for (const f of files) upstream.append('files', f, f.name || 'sample.mp3');

      const r = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: { 'xi-api-key': key },
        body: upstream,
      });
      if (!r.ok) {
        const errText = await r.text();
        return c.json({ error: `ElevenLabs ${r.status}: ${errText.slice(0, 300)}` }, 502);
      }
      const data = await r.json() as { voice_id: string };
      if (!(store as unknown as { customVoices?: unknown }).customVoices) {
        (store as unknown as { customVoices: unknown[] }).customVoices = [];
      }
      const customVoices = (store as unknown as { customVoices: Array<{ voiceId: string; name: string; description: string; isMine: boolean; createdAt: string; samplesCount: number }> }).customVoices;
      customVoices.push({
        voiceId: data.voice_id, name, description, isMine: true,
        createdAt: new Date().toISOString(), samplesCount: files.length,
      });
      saveStore();
      return c.json({ ok: true, voiceId: data.voice_id, name, samplesCount: files.length });
    } catch (err: unknown) {
      return c.json({ error: err instanceof Error ? err.message : 'Clone failed' }, 500);
    }
  });

  app.get('/api/voice/mine', (c) => {
    const store = getStore();
    const list = (store as unknown as { customVoices?: unknown[] }).customVoices || [];
    return c.json({ voices: list });
  });

  app.delete('/api/voice/clone/:voiceId', async (c) => {
    const store = getStore();
    const key = getApiKey('elevenlabsApiKey');
    if (!key) return c.json({ error: 'ElevenLabs key required' }, 400);
    const voiceId = c.req.param('voiceId');
    try {
      await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, { method: 'DELETE', headers: { 'xi-api-key': key } });
    } catch {}
    const customVoices = (store as unknown as { customVoices?: Array<{ voiceId: string }> }).customVoices;
    if (customVoices) {
      const idx = customVoices.findIndex((v) => v.voiceId === voiceId);
      if (idx >= 0) customVoices.splice(idx, 1);
      saveStore();
    }
    return c.json({ ok: true });
  });

  // Cached sample — voiceId + optional accent is the cache key
  app.get('/api/audio/voice-sample/:voiceId', async (c) => {
    const voiceId = c.req.param('voiceId');
    const accent = c.req.query('accent') || '';
    const accentSlug = accent.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12);
    const cacheKey = accentSlug ? `${voiceId}__${accentSlug}` : voiceId;
    const cachedFile = path.join(VOICE_SAMPLES_DIR, `${cacheKey}.mp3`);

    if (fs.existsSync(cachedFile)) {
      return new Response(fs.readFileSync(cachedFile), {
        headers: { 'content-type': 'audio/mpeg', 'x-cache': 'hit', 'cache-control': 'public, max-age=86400' }
      });
    }

    const tail = accentTailFor(accent);
    const text = SAMPLE_BASE + tail;
    const buf = await elevenlabsTTS(text, voiceId);
    if (!buf) return c.json({ error: 'Sample generation failed' }, 502);
    try { fs.writeFileSync(cachedFile, buf); } catch {}
    return new Response(buf, {
      headers: { 'content-type': 'audio/mpeg', 'x-cache': 'miss', 'cache-control': 'public, max-age=86400' }
    });
  });

  app.get('/api/audio/voice-samples/status', (c) => {
    const cached = fs.existsSync(VOICE_SAMPLES_DIR)
      ? fs.readdirSync(VOICE_SAMPLES_DIR).filter((n) => n.endsWith('.mp3')).map((n) => n.replace(/\.mp3$/, ''))
      : [];
    return c.json({ cached });
  });

  app.delete('/api/audio/voice-sample/:voiceId', (c) => {
    const voiceId = c.req.param('voiceId');
    const matches = fs.readdirSync(VOICE_SAMPLES_DIR).filter((n) => n.startsWith(voiceId));
    for (const m of matches) { try { fs.unlinkSync(path.join(VOICE_SAMPLES_DIR, m)); } catch {} }
    return c.json({ ok: true, deleted: matches.length });
  });

  // Preview endpoints
  app.post('/api/audio/tts', async (c) => {
    const body = await c.req.json<{ text: string; voiceId?: string }>();
    if (!body.text?.trim()) return c.json({ error: 'text required' }, 400);
    const buf = await elevenlabsTTS(body.text, body.voiceId);
    if (!buf) return c.json({ error: 'TTS failed — check ElevenLabs key' }, 502);
    return new Response(buf, { headers: { 'content-type': 'audio/mpeg' } });
  });

  app.post('/api/audio/sfx', async (c) => {
    const body = await c.req.json<{ description: string; durationSec?: number }>();
    if (!body.description?.trim()) return c.json({ error: 'description required' }, 400);
    const buf = await elevenlabsSFX(body.description, body.durationSec);
    if (!buf) return c.json({ error: 'SFX failed — check ElevenLabs key' }, 502);
    return new Response(buf, { headers: { 'content-type': 'audio/mpeg' } });
  });

  app.post('/api/audio/music', async (c) => {
    const body = await c.req.json<{ prompt: string; durationSec: number }>();
    if (!body.prompt?.trim()) return c.json({ error: 'prompt required' }, 400);
    const buf = await stableAudioMusic(body.prompt, body.durationSec || 20);
    if (!buf) return c.json({ error: 'Music failed — check Stable Audio key' }, 502);
    return new Response(buf, { headers: { 'content-type': 'audio/mpeg' } });
  });

  app.post('/api/audio/plan/suggest', async (c) => {
    const body = await c.req.json<{ topic: string; durationSec: number; language?: 'ar' | 'en'; scenes?: Array<{ text: string; durationSec: number }> }>();
    const isAr = (body.language ?? 'ar') === 'ar';
    const segments: AudioSegment[] = [];
    let t = 0;
    if (body.scenes && body.scenes.length > 0) {
      for (const s of body.scenes) {
        segments.push({
          startSec: t, endSec: t + s.durationSec,
          kind: 'voice', text: s.text, volume: 1.0,
        });
        t += s.durationSec;
      }
      segments.push({
        startSec: 0, endSec: body.durationSec,
        kind: 'music',
        text: isAr ? 'موسيقى خلفية هادئة مع طبلات خفيفة' : 'calm background music with soft drums',
        volume: 0.3,
      });
    } else {
      segments.push({
        startSec: 0, endSec: body.durationSec,
        kind: 'voice',
        text: isAr
          ? `شرح مختصر عن ${body.topic}. عدّل النص أو احذفه بالكامل.`
          : `Brief explanation of ${body.topic}. Edit or remove this text.`,
        volume: 1.0,
      });
      segments.push({
        startSec: 0, endSec: body.durationSec,
        kind: 'music',
        text: isAr ? 'موسيقى خلفية حديثة' : 'modern background music',
        volume: 0.25,
      });
    }
    return c.json({ enabled: true, backend: 'elevenlabs', segments } as AudioPlan);
  });
}
