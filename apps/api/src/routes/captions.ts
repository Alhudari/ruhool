import type { Hono } from 'hono';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StoreData } from '../store/types.js';
import { STYLE_PRESETS } from '../services/audio.js';

export type CaptionWord = { text: string; start: number; end: number };
export type CaptionSegment = { id: string; start: number; end: number; text: string; words?: CaptionWord[] };
export type CaptionStyle = {
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

export interface CaptionsRoutesDeps {
  getStore: () => StoreData;
  getApiKey: (field: string) => string | undefined;
  captionsDir: string;
  uploadsDir: string;
  videosDir: string;
}

/** Build ASS subtitle file from segments + style. */
export function segmentsToASS(segments: CaptionSegment[], style: CaptionStyle, width: number, height: number): string {
  const preset = STYLE_PRESETS[style.preset] || STYLE_PRESETS['clean-white'];
  const fontSize = style.fontSize ?? preset.fontSize ?? 56;
  const color = style.color || preset.color || '#FFFFFF';
  const strokeColor = style.strokeColor || preset.strokeColor || '#000000';
  const strokeWidth = style.strokeWidth ?? preset.strokeWidth ?? 3;
  const position = style.position || preset.position || 'bottom';
  const wordHighlight = style.wordHighlight ?? preset.wordHighlight ?? false;

  const toAssColor = (hex: string): string => {
    const h = hex.replace('#', '');
    const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
    return `&H00${b}${g}${r}`.toUpperCase();
  };

  const align = position === 'bottom' ? 2 : position === 'center' ? 5 : 8;
  const marginV = position === 'bottom' ? 80 : 0;

  const assTime = (t: number): string => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = (t % 60).toFixed(2).padStart(5, '0');
    return `${h}:${m.toString().padStart(2, '0')}:${s}`;
  };

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${toAssColor(color)},${toAssColor(color)},${toAssColor(strokeColor)},&H80000000,-1,0,0,0,100,100,0,0,1,${strokeWidth},2,${align},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = segments.map((seg) => {
    if (wordHighlight && seg.words && seg.words.length > 0) {
      const text = seg.words.map((w) => {
        const dur = Math.max(1, Math.round((w.end - w.start) * 100));
        return `{\\k${dur}}${w.text} `;
      }).join('');
      return `Dialogue: 0,${assTime(seg.start)},${assTime(seg.end)},Default,,0,0,0,,${text}`;
    }
    return `Dialogue: 0,${assTime(seg.start)},${assTime(seg.end)},Default,,0,0,0,,${seg.text}`;
  });

  return header + lines.join('\n');
}

/**
 * Captions/subtitles pipeline routes.
 *  /api/captions/upload (POST)
 *  /api/uploads/:filename (GET)
 *  /api/captions/transcribe (POST)
 *  /api/captions/burn (POST)
 *  /api/creative/auto-caption (POST)
 *  /api/captions/transcripts (GET)
 */
export function registerCaptionsRoutes(app: Hono, deps: CaptionsRoutesDeps): void {
  const { getStore, getApiKey, captionsDir, uploadsDir, videosDir } = deps;
  fs.mkdirSync(captionsDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  app.post('/api/captions/upload', async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || typeof file === 'string') return c.json({ error: 'No file' }, 400);
    const f = file as File;
    const id = crypto.randomUUID().slice(0, 8);
    const ext = path.extname(f.name || '.mp4') || '.mp4';
    const filename = `${id}${ext}`;
    const filepath = path.join(uploadsDir, filename);
    const buf = Buffer.from(await f.arrayBuffer());
    fs.writeFileSync(filepath, buf);
    return c.json({ ok: true, id, filename, sizeBytes: buf.length, url: `/api/uploads/${filename}` });
  });

  app.get('/api/uploads/:filename', (c) => {
    const filename = c.req.param('filename');
    if (filename.includes('..') || filename.includes('/')) return c.json({ error: 'bad name' }, 400);
    const p = path.join(uploadsDir, filename);
    if (!fs.existsSync(p)) return c.json({ error: 'Not found' }, 404);
    const buf = fs.readFileSync(p);
    const ext = path.extname(filename).toLowerCase();
    const ct = ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : ext === '.mov' ? 'video/quicktime' : 'application/octet-stream';
    return new Response(buf, { headers: { 'content-type': ct } });
  });

  app.post('/api/captions/transcribe', async (c) => {
    const body = await c.req.json<{ uploadId: string; language?: string }>();
    if (!body.uploadId) return c.json({ error: 'uploadId required' }, 400);
    const groqKey = getApiKey('groqApiKey');
    if (!groqKey) return c.json({ error: 'Missing Groq API key (Settings → External Services)' }, 400);

    const entries = fs.readdirSync(uploadsDir).filter((n) => n.startsWith(body.uploadId));
    if (!entries.length) return c.json({ error: 'Upload not found' }, 404);
    const videoPath = path.join(uploadsDir, entries[0]);

    const { exec } = await import('node:child_process');
    const execAsync = (await import('node:util')).promisify(exec);
    const audioPath = path.join(uploadsDir, `${body.uploadId}.mp3`);
    try {
      await execAsync(`ffmpeg -y -i "${videoPath}" -vn -ar 16000 -ac 1 -b:a 64k "${audioPath}"`, { timeout: 120_000 });
    } catch (e) {
      return c.json({ error: 'Audio extraction failed', details: String(e).slice(0, 200) }, 500);
    }

    const audioBuf = fs.readFileSync(audioPath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audioBuf)], { type: 'audio/mpeg' }), 'audio.mp3');
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    if (body.language) form.append('language', body.language);

    try {
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${groqKey}` },
        body: form,
      });
      if (!r.ok) {
        const errText = await r.text();
        return c.json({ error: `Groq error: ${errText.slice(0, 200)}` }, 502);
      }
      const data = await r.json() as {
        text: string;
        segments?: Array<{ id: number; start: number; end: number; text: string }>;
        words?: Array<{ word: string; start: number; end: number }>;
      };

      const words: CaptionWord[] = (data.words || []).map((w) => ({ text: w.word, start: w.start, end: w.end }));
      const segments: CaptionSegment[] = [];
      if (words.length > 0) {
        let buf: CaptionWord[] = [];
        for (const w of words) {
          buf.push(w);
          if (buf.length >= 5 || (w.text.match(/[.!؟.]$/))) {
            segments.push({
              id: crypto.randomUUID().slice(0, 6),
              start: buf[0].start, end: buf[buf.length - 1].end,
              text: buf.map(b => b.text).join(' ').trim(),
              words: buf,
            });
            buf = [];
          }
        }
        if (buf.length) segments.push({
          id: crypto.randomUUID().slice(0, 6),
          start: buf[0].start, end: buf[buf.length - 1].end,
          text: buf.map(b => b.text).join(' ').trim(),
          words: buf,
        });
      } else if (data.segments) {
        for (const s of data.segments) {
          segments.push({ id: crypto.randomUUID().slice(0, 6), start: s.start, end: s.end, text: s.text.trim() });
        }
      } else {
        segments.push({ id: crypto.randomUUID().slice(0, 6), start: 0, end: 5, text: data.text });
      }

      const transcriptPath = path.join(captionsDir, `${body.uploadId}.json`);
      fs.writeFileSync(transcriptPath, JSON.stringify({ uploadId: body.uploadId, fullText: data.text, segments }, null, 2));

      try { fs.unlinkSync(audioPath); } catch {}

      return c.json({ ok: true, uploadId: body.uploadId, fullText: data.text, segments });
    } catch (e) {
      return c.json({ error: 'Transcription failed', details: String(e).slice(0, 200) }, 500);
    }
  });

  app.post('/api/captions/burn', async (c) => {
    const body = await c.req.json<{ uploadId: string; segments: CaptionSegment[]; style: CaptionStyle; trimStartSec?: number; trimEndSec?: number }>();
    if (!body.uploadId || !body.segments?.length) return c.json({ error: 'uploadId + segments required' }, 400);

    const entries = fs.readdirSync(uploadsDir).filter((n) => n.startsWith(body.uploadId) && !n.endsWith('.mp3'));
    if (!entries.length) return c.json({ error: 'Upload not found' }, 404);
    const inPath = path.join(uploadsDir, entries[0]);

    const { exec } = await import('node:child_process');
    const execAsync = (await import('node:util')).promisify(exec);
    let width = 1080, height = 1920;
    try {
      const { stdout } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${inPath}"`);
      const [w, h] = stdout.trim().split('x').map(Number);
      if (w && h) { width = w; height = h; }
    } catch { /* fallback */ }

    const assContent = segmentsToASS(body.segments, body.style, width, height);
    const assPath = path.join(captionsDir, `${body.uploadId}-${Date.now()}.ass`);
    fs.writeFileSync(assPath, assContent, 'utf-8');

    const outId = crypto.randomUUID().slice(0, 8);
    const outPath = path.join(videosDir, `cap-${outId}.mp4`);

    const assEscaped = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const trimArgs = (body.trimStartSec || body.trimEndSec)
      ? `-ss ${body.trimStartSec || 0} ${body.trimEndSec ? `-to ${body.trimEndSec}` : ''}`
      : '';

    try {
      await execAsync(`ffmpeg -y ${trimArgs} -i "${inPath}" -vf "ass='${assEscaped}'" -c:a copy "${outPath}"`, { timeout: 300_000 });
      try { fs.unlinkSync(assPath); } catch {}

      const size = fs.statSync(outPath).size;
      const metaFile = path.join(videosDir, '_renders.json');
      try {
        const arr = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf-8')) : [];
        arr.unshift({
          id: outId, filename: `cap-${outId}.mp4`, format: 'mp4',
          width, height, fps: 30, durationInFrames: 0,
          renderedAt: new Date().toISOString(), renderDurationMs: 0, sizeBytes: size,
          source: 'captions', tool: 'ffmpeg-ass', title: 'Captioned video', hasAudio: true,
        });
        fs.writeFileSync(metaFile, JSON.stringify(arr, null, 2));
      } catch { /* ignore meta failure */ }

      return c.json({ ok: true, filename: `cap-${outId}.mp4`, url: `/api/videos/cap-${outId}.mp4`, sizeBytes: size });
    } catch (e) {
      return c.json({ error: 'Burn failed', details: String(e).slice(0, 400) }, 500);
    }
  });

  // Auto-caption a Creative render end-to-end
  app.post('/api/creative/auto-caption', async (c) => {
    const body = await c.req.json<{ filename: string; preset?: string; language?: string }>();
    if (!body.filename) return c.json({ error: 'Missing filename' }, 400);

    const store = getStore();
    const apiKeys = ((store as unknown as { apiKeys?: Record<string, string> }).apiKeys || {}) as Record<string, string>;
    const groqKey = apiKeys.groqKey;
    if (!groqKey) return c.json({ error: 'No Groq API key configured' }, 400);

    const inPath = path.join(videosDir, body.filename);
    if (!fs.existsSync(inPath)) return c.json({ error: 'File not found' }, 404);

    const { exec } = await import('node:child_process');
    const execAsync = (await import('node:util')).promisify(exec);

    const workId = crypto.randomUUID().slice(0, 8);
    const audioPath = path.join(uploadsDir, `autocap-${workId}.mp3`);

    try {
      await execAsync(`ffmpeg -y -i "${inPath}" -vn -ar 16000 -ac 1 -b:a 64k "${audioPath}"`, { timeout: 180_000 });

      const audioBuf = fs.readFileSync(audioPath);
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audioBuf)], { type: 'audio/mpeg' }), 'audio.mp3');
      form.append('model', 'whisper-large-v3');
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      if (body.language) form.append('language', body.language);
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { authorization: `Bearer ${groqKey}` }, body: form,
      });
      if (!r.ok) {
        try { fs.unlinkSync(audioPath); } catch {}
        return c.json({ error: `Groq error ${r.status}` }, 502);
      }
      const data = await r.json() as {
        text: string;
        segments?: Array<{ start: number; end: number; text: string }>;
        words?: Array<{ word: string; start: number; end: number }>;
      };
      const words: CaptionWord[] = (data.words || []).map((w) => ({ text: w.word, start: w.start, end: w.end }));
      const segments: CaptionSegment[] = [];
      if (words.length > 0) {
        let buf: CaptionWord[] = [];
        for (const w of words) {
          buf.push(w);
          if (buf.length >= 5 || (w.text.match(/[.!؟.]$/))) {
            segments.push({ id: crypto.randomUUID().slice(0, 6), start: buf[0].start, end: buf[buf.length - 1].end, text: buf.map(b => b.text).join(' ').trim(), words: buf });
            buf = [];
          }
        }
        if (buf.length) segments.push({ id: crypto.randomUUID().slice(0, 6), start: buf[0].start, end: buf[buf.length - 1].end, text: buf.map(b => b.text).join(' ').trim(), words: buf });
      } else if (data.segments) {
        for (const s of data.segments) segments.push({ id: crypto.randomUUID().slice(0, 6), start: s.start, end: s.end, text: s.text.trim() });
      }

      let width = 1920, height = 1080;
      try {
        const { stdout } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${inPath}"`);
        const [w, h] = stdout.trim().split(',').map((x) => parseInt(x, 10));
        if (w && h) { width = w; height = h; }
      } catch {}

      const preset = body.preset || 'clean-white';
      const ass = segmentsToASS(segments, { preset } as CaptionStyle, width, height);
      const assPath = path.join(captionsDir, `autocap-${workId}.ass`);
      fs.writeFileSync(assPath, ass, 'utf-8');
      const outId = crypto.randomUUID().slice(0, 8);
      const outName = `autocap-${outId}.mp4`;
      const outPath = path.join(videosDir, outName);
      const assEsc = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      await execAsync(`ffmpeg -y -i "${inPath}" -vf "ass='${assEsc}'" -c:a copy "${outPath}"`, { timeout: 300_000 });
      try { fs.unlinkSync(assPath); fs.unlinkSync(audioPath); } catch {}

      const metaFile = path.join(videosDir, '_renders.json');
      try {
        const arr = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf-8')) : [];
        arr.unshift({
          id: outId, filename: outName, format: 'mp4', width, height, fps: 30, durationInFrames: 0,
          renderedAt: new Date().toISOString(), renderDurationMs: 0, sizeBytes: fs.statSync(outPath).size,
          source: 'auto-caption', tool: 'whisper+ffmpeg-ass', title: `Captioned: ${body.filename}`, hasAudio: true,
          parentFilename: body.filename,
        });
        fs.writeFileSync(metaFile, JSON.stringify(arr, null, 2));
      } catch {}

      return c.json({ ok: true, filename: outName, segments: segments.length, text: data.text });
    } catch (err: unknown) {
      try { fs.unlinkSync(audioPath); } catch {}
      return c.json({ error: err instanceof Error ? err.message : 'Auto-caption failed' }, 500);
    }
  });

  app.get('/api/captions/transcripts', (c) => {
    if (!fs.existsSync(captionsDir)) return c.json([]);
    const files = fs.readdirSync(captionsDir).filter((n) => n.endsWith('.json'));
    const items = files.map((n) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(captionsDir, n), 'utf-8'));
        return { uploadId: data.uploadId, fullText: (data.fullText || '').slice(0, 120), segmentCount: data.segments?.length || 0 };
      } catch { return null; }
    }).filter(Boolean);
    return c.json(items);
  });
}
