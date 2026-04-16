// Render-audio helpers extracted from index.ts (REL-01 stage 2d).
// Provides: muxAudioOntoVideo, replaceRenderMetaWithAudio, attachCostToRender,
// and shared estimateAudioPlanCost.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PRICING } from '../state/pricing.js';

export type CostLine = { service: string; units: number; unitName: string; usd: number };

export function estimateAudioPlanCost(plan: AudioPlan | undefined): { lines: CostLine[]; totalUSD: number } {
  const lines: CostLine[] = [];
  if (!plan?.enabled) return { lines, totalUSD: 0 };
  for (const seg of plan.segments) {
    const chars = seg.text.length;
    if (seg.kind === 'voice') {
      const usd = chars * PRICING.elevenlabs.perChar;
      lines.push({ service: 'ElevenLabs TTS', units: chars, unitName: 'chars', usd });
    } else if (seg.kind === 'sfx') {
      const usd = chars * PRICING.elevenlabs.perChar;
      lines.push({ service: 'ElevenLabs SFX', units: chars, unitName: 'chars', usd });
    } else if (seg.kind === 'music') {
      const usd = PRICING.stableAudio.perTrack;
      lines.push({ service: 'Stable Audio', units: 1, unitName: 'track', usd });
    }
  }
  const totalUSD = lines.reduce((s, l) => s + l.usd, 0);
  return { lines, totalUSD };
}

export type AudioSegment = {
  startSec: number;
  endSec: number;
  kind: 'voice' | 'sfx' | 'music';
  text: string;
  voiceId?: string;
  volume?: number;
  dialect?: string;
};

export type AudioPlan = {
  enabled: boolean;
  backend: 'elevenlabs' | 'stableaudio' | 'audiocraft';
  segments: AudioSegment[];
};

export interface RenderAudioServiceDeps {
  audioDir: string;
  videosDir: string;
  elevenlabsTTS: (text: string, voiceId?: string, dialect?: string) => Promise<Buffer | null>;
  elevenlabsSFX: (text: string, duration: number) => Promise<Buffer | null>;
  stableAudioMusic: (text: string, duration: number) => Promise<Buffer | null>;
  estimateAudioPlanCost: (plan: AudioPlan | undefined) => { lines: CostLine[]; totalUSD: number };
  logger: { error: (obj: { err: unknown }, msg: string) => void };
}

export interface RenderAudioService {
  replaceRenderMetaWithAudio: (oldFilename: string, newFilename: string, costLines?: CostLine[]) => void;
  attachCostToRender: (filename: string, costLines: CostLine[]) => void;
  muxAudioOntoVideo: (videoFilename: string, plan: AudioPlan) => Promise<{ ok: boolean; filename?: string }>;
}

export function createRenderAudioService(deps: RenderAudioServiceDeps): RenderAudioService {
  const { audioDir, videosDir, elevenlabsTTS, elevenlabsSFX, stableAudioMusic, estimateAudioPlanCost, logger } = deps;

  function replaceRenderMetaWithAudio(oldFilename: string, newFilename: string, costLines?: CostLine[]): void {
    try {
      const metaFile = path.join(videosDir, '_renders.json');
      if (!fs.existsSync(metaFile)) return;
      const arr = JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as Array<Record<string, unknown>>;
      const idx = arr.findIndex((e) => e.filename === oldFilename);
      if (idx === -1) return;
      const newPath = path.join(videosDir, newFilename);
      const size = fs.existsSync(newPath) ? fs.statSync(newPath).size : (arr[idx].sizeBytes as number);
      arr[idx].filename = newFilename;
      arr[idx].sizeBytes = size;
      (arr[idx] as Record<string, unknown>).hasAudio = true;
      if (costLines && costLines.length > 0) {
        (arr[idx] as Record<string, unknown>).costLines = costLines;
        (arr[idx] as Record<string, unknown>).costUSD = costLines.reduce((s, l) => s + l.usd, 0);
      }
      fs.writeFileSync(metaFile, JSON.stringify(arr, null, 2));
      try { const oldPath = path.join(videosDir, oldFilename); if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch {}
    } catch (e) {
      logger.error({ err: e }, 'replaceRenderMetaWithAudio failed');
    }
  }

  function attachCostToRender(filename: string, costLines: CostLine[]): void {
    try {
      const metaFile = path.join(videosDir, '_renders.json');
      if (!fs.existsSync(metaFile)) return;
      const arr = JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as Array<Record<string, unknown>>;
      const idx = arr.findIndex((e) => e.filename === filename);
      if (idx === -1) return;
      (arr[idx] as Record<string, unknown>).costLines = costLines;
      (arr[idx] as Record<string, unknown>).costUSD = costLines.reduce((s, l) => s + l.usd, 0);
      fs.writeFileSync(metaFile, JSON.stringify(arr, null, 2));
    } catch { /* ignore */ }
  }

  async function muxAudioOntoVideo(videoFilename: string, plan: AudioPlan): Promise<{ ok: boolean; filename?: string }> {
    if (!plan.segments?.length) return { ok: false };
    const inFile = path.join(videosDir, videoFilename);
    if (!fs.existsSync(inFile)) return { ok: false };

    type SegFile = { file: string; startSec: number; volume: number; kind: 'voice' | 'sfx' | 'music' };
    const segFiles: SegFile[] = [];
    for (let i = 0; i < plan.segments.length; i++) {
      const seg = plan.segments[i];
      let buf: Buffer | null = null;
      if (seg.kind === 'voice') buf = await elevenlabsTTS(seg.text, seg.voiceId, seg.dialect);
      else if (seg.kind === 'sfx') buf = await elevenlabsSFX(seg.text, seg.endSec - seg.startSec);
      else if (seg.kind === 'music') buf = await stableAudioMusic(seg.text, seg.endSec - seg.startSec) ?? await elevenlabsSFX(seg.text, seg.endSec - seg.startSec);
      if (!buf) continue;
      const segFile = path.join(audioDir, `seg-${crypto.randomUUID().slice(0, 6)}.mp3`);
      fs.writeFileSync(segFile, buf);
      segFiles.push({ file: segFile, startSec: seg.startSec, volume: seg.volume ?? 1.0, kind: seg.kind });
    }
    if (!segFiles.length) return { ok: false };

    const { exec } = await import('node:child_process');
    const execAsync = (await import('node:util')).promisify(exec);
    const outName = `audio-${path.basename(videoFilename, path.extname(videoFilename))}.mp4`;
    const outFile = path.join(videosDir, outName);
    const inputs = segFiles.map((s) => `-i "${s.file}"`).join(' ');

    const chains: string[] = [];
    segFiles.forEach((s, i) => {
      chains.push(`[${i + 1}:a]adelay=${Math.round(s.startSec * 1000)}|${Math.round(s.startSec * 1000)},volume=${s.volume}[a${i}]`);
    });

    const voiceIdx = segFiles.map((s, i) => s.kind === 'voice' ? i : -1).filter((x) => x >= 0);
    const musicIdx = segFiles.map((s, i) => s.kind === 'music' ? i : -1).filter((x) => x >= 0);
    const otherIdx = segFiles.map((s, i) => (s.kind !== 'voice' && s.kind !== 'music') ? i : -1).filter((x) => x >= 0);

    const finalLabel = 'aout';
    if (voiceIdx.length > 0 && musicIdx.length > 0) {
      if (voiceIdx.length === 1) {
        chains.push(`[a${voiceIdx[0]}]asplit=2[voice][voicekey]`);
      } else {
        const vm = voiceIdx.map((i) => `[a${i}]`).join('');
        chains.push(`${vm}amix=inputs=${voiceIdx.length}:normalize=0[voicemix]`);
        chains.push(`[voicemix]asplit=2[voice][voicekey]`);
      }
      let musicPre = '';
      if (musicIdx.length === 1) {
        musicPre = `[a${musicIdx[0]}]`;
      } else {
        const mm = musicIdx.map((i) => `[a${i}]`).join('');
        chains.push(`${mm}amix=inputs=${musicIdx.length}:normalize=0[musicmix]`);
        musicPre = '[musicmix]';
      }
      chains.push(`${musicPre}[voicekey]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=250:makeup=1[ducked]`);
      const combine = ['[voice]', '[ducked]', ...otherIdx.map((i) => `[a${i}]`)];
      chains.push(`${combine.join('')}amix=inputs=${combine.length}:normalize=0[aout]`);
    } else {
      const all = segFiles.map((_, i) => `[a${i}]`).join('');
      chains.push(`${all}amix=inputs=${segFiles.length}:normalize=0[aout]`);
    }

    const filter = chains.join(';');
    try {
      await execAsync(`ffmpeg -y -i "${inFile}" ${inputs} -filter_complex "${filter}" -map 0:v -map "[${finalLabel}]" -c:v copy -c:a aac -shortest "${outFile}"`, { timeout: 180_000 });
      for (const s of segFiles) { try { fs.unlinkSync(s.file); } catch {} }
      const { lines: costLines } = estimateAudioPlanCost(plan);
      replaceRenderMetaWithAudio(videoFilename, outName, costLines);
      return { ok: true, filename: outName };
    } catch (e) {
      logger.error({ err: e }, 'ffmpeg mux error');
      return { ok: false };
    }
  }

  return { replaceRenderMetaWithAudio, attachCostToRender, muxAudioOntoVideo };
}
