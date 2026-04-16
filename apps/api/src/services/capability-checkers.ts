// ─── API Key capability checks ───
// Each check pings the real service and reports what actually works.
// Extracted from index.ts (Phase E of REL-01 stage 2d).

export type CapabilityResult = { ok: boolean; message: string };

export async function checkMapbox(key: string): Promise<Record<string, CapabilityResult>> {
  const res: Record<string, CapabilityResult> = {};
  try {
    const r = await fetch(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/0,0,1,0/100x100?access_token=${key}`);
    res.staticMaps = { ok: r.ok, message: r.ok ? 'Static maps enabled' : `${r.status}: ${(await r.text()).slice(0, 100)}` };
  } catch (e) { res.staticMaps = { ok: false, message: String(e).slice(0, 100) }; }
  return res;
}

export async function checkMapTiler(key: string): Promise<Record<string, CapabilityResult>> {
  const res: Record<string, CapabilityResult> = {};
  try {
    const r = await fetch(`https://api.maptiler.com/maps/streets-v2/static/0,0,1/100x100.png?key=${key}`);
    if (r.ok) {
      res.staticMaps = { ok: true, message: 'Static maps enabled' };
    } else {
      const errText = r.headers.get('statusText') || await r.text();
      res.staticMaps = { ok: false, message: (errText || `HTTP ${r.status}`).slice(0, 150) };
    }
    const rv = await fetch(`https://api.maptiler.com/tiles/v3/tiles.json?key=${key}`);
    res.vectorTiles = { ok: rv.ok, message: rv.ok ? 'Vector tiles enabled' : `HTTP ${rv.status}` };
  } catch (e) { res.staticMaps = { ok: false, message: String(e).slice(0, 100) }; }
  return res;
}

export async function checkGeoapify(key: string): Promise<Record<string, CapabilityResult>> {
  const res: Record<string, CapabilityResult> = {};
  try {
    const r = await fetch(`https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=100&height=100&center=lonlat:0,0&zoom=1&apiKey=${key}`);
    res.staticMaps = { ok: r.ok, message: r.ok ? 'Static maps enabled' : `HTTP ${r.status}: ${(await r.text()).slice(0, 100)}` };
  } catch (e) { res.staticMaps = { ok: false, message: String(e).slice(0, 100) }; }
  return res;
}

export async function checkThunderforest(key: string): Promise<Record<string, CapabilityResult>> {
  const res: Record<string, CapabilityResult> = {};
  try {
    const r = await fetch(`https://tile.thunderforest.com/landscape/1/0/0.png?apikey=${key}`);
    res.tiles = { ok: r.ok, message: r.ok ? 'Tile access enabled' : `HTTP ${r.status}` };
  } catch (e) { res.tiles = { ok: false, message: String(e).slice(0, 100) }; }
  return res;
}

export async function checkElevenLabs(key: string): Promise<Record<string, CapabilityResult>> {
  const res: Record<string, CapabilityResult> = {};
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } });
    if (r.ok) {
      const data = await r.json() as { character_count: number; character_limit: number; tier?: string };
      const remaining = data.character_limit - data.character_count;
      res.tts = { ok: true, message: `TTS: ${remaining.toLocaleString()} characters remaining (${data.tier || 'free'})` };
      res.sfx = { ok: true, message: 'SFX endpoint available (same quota)' };
    } else {
      res.tts = { ok: false, message: `HTTP ${r.status}` };
    }
  } catch (e) { res.tts = { ok: false, message: String(e).slice(0, 100) }; }
  return res;
}

export async function checkStabilityAI(key: string): Promise<Record<string, CapabilityResult>> {
  const res: Record<string, CapabilityResult> = {};
  try {
    const r = await fetch('https://api.stability.ai/v1/user/balance', { headers: { authorization: `Bearer ${key}` } });
    if (r.ok) {
      const data = await r.json() as { credits: number };
      res.stableAudio = { ok: data.credits > 0, message: `${data.credits.toFixed(1)} credits available` };
    } else {
      res.stableAudio = { ok: false, message: `HTTP ${r.status}` };
    }
  } catch (e) { res.stableAudio = { ok: false, message: String(e).slice(0, 100) }; }
  return res;
}

export async function checkGroq(key: string): Promise<Record<string, CapabilityResult>> {
  const res: Record<string, CapabilityResult> = {};
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${key}` } });
    if (r.ok) {
      const data = await r.json() as { data?: Array<{ id: string }> };
      const hasWhisper = (data.data || []).some((m) => m.id.includes('whisper'));
      res.whisper = { ok: hasWhisper, message: hasWhisper ? 'Whisper (speech-to-text) available' : 'Whisper not in your model list' };
    } else {
      res.whisper = { ok: false, message: `HTTP ${r.status}` };
    }
  } catch (e) { res.whisper = { ok: false, message: String(e).slice(0, 100) }; }
  return res;
}

export async function checkAudiocraft(url: string): Promise<Record<string, CapabilityResult>> {
  const res: Record<string, CapabilityResult> = {};
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/docs`, { signal: AbortSignal.timeout(3000) });
    res.localServer = { ok: r.ok, message: r.ok ? 'Local server reachable' : `HTTP ${r.status}` };
  } catch (e) { res.localServer = { ok: false, message: 'Cannot reach local server' }; }
  return res;
}

export const CAPABILITY_CHECKERS: Record<string, (v: string) => Promise<Record<string, CapabilityResult>>> = {
  mapboxToken: checkMapbox,
  maptilerKey: checkMapTiler,
  geoapifyKey: checkGeoapify,
  thunderforestKey: checkThunderforest,
  elevenlabsApiKey: checkElevenLabs,
  stableAudioKey: checkStabilityAI,
  audiocraftLocalUrl: checkAudiocraft,
  groqApiKey: checkGroq,
};
