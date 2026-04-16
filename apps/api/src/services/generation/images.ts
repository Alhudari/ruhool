/**
 * Image generation service — Phase 5 (artifact pipeline).
 *
 * Factory pattern. Detects the first available provider among
 * Stability AI → fal.ai → OpenAI DALL·E → Google Imagen and routes the
 * request there. Saves the bytes under `data/images/generated/` and returns
 * a `/api/files/images/generated/<filename>` URL the dashboard can fetch.
 *
 * No provider keys → throws `NoProviderError` with a human-readable message.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class NoProviderError extends Error {
  constructor(message = 'no image generation keys configured (need one of: stabilityApiKey, falApiKey, openaiApiKey, googleApiKey)') {
    super(message);
    this.name = 'NoProviderError';
  }
}

export interface ImageGenerationLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
  error?: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface ImageServiceDeps {
  getApiKey: (field: string) => string | undefined;
  logger?: ImageGenerationLogger;
  /** Base directory under which `images/generated/` lives. Defaults to `data/`. */
  dataDir?: string;
}

export interface GenerateImageParams {
  prompt: string;
  specialist: string;
  style?: string;
  size?: string;
  model?: string;
}

export interface GenerateImageResult {
  url: string;
  meta: {
    provider: string;
    model: string;
    costUsd: number;
    durationMs: number;
    bytes: number;
    filename: string;
    specialist: string;
    style?: string;
    size?: string;
  };
}

export interface ImageService {
  generateImage(params: GenerateImageParams): Promise<GenerateImageResult>;
  outputDir: string;
}

export function createImageService(deps: ImageServiceDeps): ImageService {
  const dataDir = deps.dataDir ?? path.resolve(import.meta.dirname || '.', '../../../../data');
  const outputDir = path.join(dataDir, 'images', 'generated');
  fs.mkdirSync(outputDir, { recursive: true });

  function shortId(): string {
    return crypto.randomBytes(4).toString('hex');
  }

  function writeFile(bytes: Buffer, ext: string): { filename: string; fullPath: string } {
    const filename = `${Date.now()}-${shortId()}.${ext}`;
    const full = path.join(outputDir, filename);
    fs.writeFileSync(full, bytes);
    return { filename, fullPath: full };
  }

  async function generateViaStability(prompt: string, apiKey: string, size?: string): Promise<{ bytes: Buffer; model: string; costUsd: number }> {
    const fd = new FormData();
    fd.append('prompt', prompt);
    fd.append('output_format', 'png');
    if (size) fd.append('aspect_ratio', size);
    const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, accept: 'image/*' },
      body: fd,
    });
    if (!res.ok) throw new Error(`stability ${res.status}: ${await res.text().catch(() => '')}`);
    return { bytes: Buffer.from(await res.arrayBuffer()), model: 'stable-image-core', costUsd: 0.03 };
  }

  async function generateViaFal(prompt: string, apiKey: string, model?: string): Promise<{ bytes: Buffer; model: string; costUsd: number }> {
    const mdl = model || 'fal-ai/flux/schnell';
    const res = await fetch(`https://fal.run/${mdl}`, {
      method: 'POST',
      headers: { authorization: `Key ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text().catch(() => '')}`);
    const data = (await res.json()) as { images?: Array<{ url: string }> };
    const imgUrl = data.images?.[0]?.url;
    if (!imgUrl) throw new Error('fal: no image in response');
    const download = await fetch(imgUrl);
    if (!download.ok) throw new Error(`fal download ${download.status}`);
    return { bytes: Buffer.from(await download.arrayBuffer()), model: mdl, costUsd: 0.01 };
  }

  async function generateViaOpenAI(prompt: string, apiKey: string, size?: string): Promise<{ bytes: Buffer; model: string; costUsd: number }> {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: size || '1024x1024',
        response_format: 'b64_json',
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text().catch(() => '')}`);
    const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('openai: no image in response');
    return { bytes: Buffer.from(b64, 'base64'), model: 'dall-e-3', costUsd: 0.04 };
  }

  async function generateViaImagen(prompt: string, apiKey: string): Promise<{ bytes: Buffer; model: string; costUsd: number }> {
    // Google Imagen 3 via Vertex/AI Studio. Best-effort: returns base64 in predictions[0].bytesBase64Encoded.
    const mdl = 'imagen-3.0-generate-001';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${mdl}:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
      },
    );
    if (!res.ok) throw new Error(`imagen ${res.status}: ${await res.text().catch(() => '')}`);
    const data = (await res.json()) as { predictions?: Array<{ bytesBase64Encoded?: string }> };
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error('imagen: no image in response');
    return { bytes: Buffer.from(b64, 'base64'), model: mdl, costUsd: 0.04 };
  }

  async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
    const started = Date.now();
    const stability = deps.getApiKey('stabilityApiKey') || deps.getApiKey('stableAudioKey');
    const fal = deps.getApiKey('falApiKey');
    const openai = deps.getApiKey('openaiApiKey');
    const google = deps.getApiKey('googleApiKey') || deps.getApiKey('geminiApiKey');

    let out: { bytes: Buffer; model: string; costUsd: number };
    let provider: string;
    try {
      if (stability) {
        provider = 'stability';
        out = await generateViaStability(params.prompt, stability, params.size);
      } else if (fal) {
        provider = 'fal';
        out = await generateViaFal(params.prompt, fal, params.model);
      } else if (openai) {
        provider = 'openai';
        out = await generateViaOpenAI(params.prompt, openai, params.size);
      } else if (google) {
        provider = 'imagen';
        out = await generateViaImagen(params.prompt, google);
      } else {
        throw new NoProviderError();
      }
    } catch (err) {
      if (err instanceof NoProviderError) throw err;
      deps.logger?.error?.({ err: err instanceof Error ? err.message : String(err), specialist: params.specialist }, 'image.generate failed');
      throw err;
    }

    const { filename } = writeFile(out.bytes, 'png');
    const durationMs = Date.now() - started;
    const url = `/api/files/images/generated/${filename}`;

    deps.logger?.info?.(
      { specialist: params.specialist, provider, model: out.model, durationMs, costUsd: out.costUsd, bytes: out.bytes.length },
      'image.generate',
    );

    return {
      url,
      meta: {
        provider,
        model: out.model,
        costUsd: out.costUsd,
        durationMs,
        bytes: out.bytes.length,
        filename,
        specialist: params.specialist,
        style: params.style,
        size: params.size,
      },
    };
  }

  return { generateImage, outputDir };
}
