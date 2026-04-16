/**
 * Video generation service — Phase 5.
 *
 * Composes a simple slideshow video from images + optional TTS voiceover
 * using ffmpeg. If `REMOTION_STUDIO_URL` is set and reachable, delegates to
 * the Remotion studio render endpoint first and falls back to ffmpeg on
 * failure. When ffmpeg is missing, throws `NoFfmpegError`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

import type { ImageService } from './images.js';
import type { GenerationAudioService } from './audio.js';

export class NoFfmpegError extends Error {
  constructor() {
    super('ffmpeg not found on PATH. Install ffmpeg (https://ffmpeg.org) to enable video generation.');
    this.name = 'NoFfmpegError';
  }
}

export interface VideoGenerationLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
  error?: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface VideoServiceDeps {
  imageService?: ImageService;
  audioGenerationService?: GenerationAudioService;
  logger?: VideoGenerationLogger;
  dataDir?: string;
  /** Optional: URL of a running Remotion studio HTTP render endpoint. */
  remotionStudioUrl?: string;
  /** Injectable ffmpeg spawner for tests. */
  spawnFn?: typeof spawn;
  /** Injectable fetch for tests. */
  fetchFn?: typeof fetch;
  /** Check for ffmpeg — returns true if present. */
  hasFfmpegFn?: () => Promise<boolean>;
}

export interface GenerateVideoParams {
  script: string;
  specialist: string;
  voiceover?: boolean;
  /** Optional pre-generated image URLs (relative `/api/files/...`) or absolute paths. */
  images?: string[];
  voice?: string;
}

export interface GenerateVideoResult {
  url: string;
  meta: {
    provider: 'remotion' | 'ffmpeg';
    durationMs: number;
    bytes: number;
    filename: string;
    specialist: string;
    imageCount: number;
    hasVoiceover: boolean;
  };
}

export interface VideoService {
  generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult>;
  outputDir: string;
}

async function defaultHasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('exit', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

export function createVideoService(deps: VideoServiceDeps): VideoService {
  const dataDir = deps.dataDir ?? path.resolve(import.meta.dirname || '.', '../../../../data');
  const outputDir = path.join(dataDir, 'videos', 'generated');
  fs.mkdirSync(outputDir, { recursive: true });
  const hasFfmpeg = deps.hasFfmpegFn ?? defaultHasFfmpeg;
  const doSpawn = deps.spawnFn ?? spawn;
  const doFetch = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  function shortId(): string {
    return crypto.randomBytes(4).toString('hex');
  }

  function resolveImagePath(ref: string): string | null {
    if (ref.startsWith('/api/files/')) {
      // Map `/api/files/images/generated/<name>` → `data/images/generated/<name>`
      const rel = ref.replace('/api/files/', '');
      return path.join(dataDir, rel);
    }
    if (path.isAbsolute(ref) && fs.existsSync(ref)) return ref;
    return null;
  }

  async function renderViaRemotion(params: GenerateVideoParams): Promise<GenerateVideoResult | null> {
    if (!deps.remotionStudioUrl) return null;
    try {
      const res = await doFetch(`${deps.remotionStudioUrl}/render`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ script: params.script, images: params.images, voiceover: params.voiceover }),
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const filename = `${Date.now()}-${shortId()}.mp4`;
      fs.writeFileSync(path.join(outputDir, filename), buf);
      return {
        url: `/api/files/video/generated/${filename}`,
        meta: {
          provider: 'remotion',
          durationMs: 0,
          bytes: buf.length,
          filename,
          specialist: params.specialist,
          imageCount: params.images?.length ?? 0,
          hasVoiceover: !!params.voiceover,
        },
      };
    } catch {
      return null;
    }
  }

  async function runFfmpeg(args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const p = doSpawn('ffmpeg', args, { stdio: 'ignore' });
      p.on('error', (err) => reject(err));
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    });
  }

  async function renderViaFfmpeg(params: GenerateVideoParams): Promise<GenerateVideoResult> {
    const started = Date.now();
    if (!(await hasFfmpeg())) throw new NoFfmpegError();

    const images = (params.images || [])
      .map((r) => resolveImagePath(r))
      .filter((p): p is string => !!p);

    const tmpId = shortId();
    const outputFilename = `${Date.now()}-${tmpId}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);
    let voicePath: string | null = null;

    try {
      // Generate TTS voiceover if requested.
      if (params.voiceover && deps.audioGenerationService) {
        try {
          const tts = await deps.audioGenerationService.generateTTS({
            prompt: params.script,
            voice: params.voice,
            specialist: params.specialist,
          });
          voicePath = path.join(dataDir, tts.url.replace('/api/files/', ''));
        } catch (err) {
          deps.logger?.warn?.({ err: err instanceof Error ? err.message : err }, 'video.tts skipped');
        }
      }

      // No images provided → synthesize a blank slide with a colored background.
      if (images.length === 0) {
        const blankArgs = [
          '-y',
          '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=5',
          ...(voicePath ? ['-i', voicePath] : []),
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
          ...(voicePath ? ['-c:a', 'aac', '-shortest'] : []),
          outputPath,
        ];
        await runFfmpeg(blankArgs);
      } else {
        // Build a slideshow: 3s per image. Use concat demuxer.
        const listPath = path.join(outputDir, `list-${tmpId}.txt`);
        const lines: string[] = [];
        for (const img of images) {
          lines.push(`file '${img.replace(/'/g, "'\\''")}'`);
          lines.push('duration 3');
        }
        // ffmpeg concat quirk: repeat last file without duration.
        lines.push(`file '${images[images.length - 1].replace(/'/g, "'\\''")}'`);
        fs.writeFileSync(listPath, lines.join('\n'));

        const args = [
          '-y',
          '-f', 'concat', '-safe', '0', '-i', listPath,
          ...(voicePath ? ['-i', voicePath] : []),
          '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
          ...(voicePath ? ['-c:a', 'aac', '-shortest'] : []),
          outputPath,
        ];
        await runFfmpeg(args);
        fs.unlinkSync(listPath);
      }
    } catch (err) {
      deps.logger?.error?.({ err: err instanceof Error ? err.message : err, specialist: params.specialist }, 'video.ffmpeg failed');
      throw err;
    }

    const bytes = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
    const durationMs = Date.now() - started;
    deps.logger?.info?.(
      { specialist: params.specialist, provider: 'ffmpeg', durationMs, bytes, images: images.length },
      'video.generate',
    );

    return {
      url: `/api/files/video/generated/${outputFilename}`,
      meta: {
        provider: 'ffmpeg',
        durationMs,
        bytes,
        filename: outputFilename,
        specialist: params.specialist,
        imageCount: images.length,
        hasVoiceover: !!voicePath,
      },
    };
  }

  async function generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult> {
    const remotion = await renderViaRemotion(params);
    if (remotion) return remotion;
    return renderViaFfmpeg(params);
  }

  return { generateVideo, outputDir };
}
