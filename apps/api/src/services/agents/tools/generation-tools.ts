/**
 * Generation tool schemas — Phase 5.
 *
 * Anthropic `tool_use` definitions exposed to specialist dispatches. The
 * schemas mirror the shape expected by the generation services so the
 * handler in `specialists.ts` can pass `tool_use.input` straight through.
 */
import type Anthropic from '@anthropic-ai/sdk';

import type { ImageService } from '../../generation/images.js';
import type { GenerationAudioService } from '../../generation/audio.js';
import type { VideoService } from '../../generation/video.js';
import type { WorkflowStepArtifact } from '../../../store/types.js';

export const GENERATE_IMAGE_TOOL: Anthropic.Tool = {
  name: 'generate_image',
  description: 'Generate an image from a textual prompt. Returns a URL to the produced PNG. Use when the user asks for a visual, illustration, diagram, or figure.',
  input_schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The image description. English or Arabic.' },
      style: { type: 'string', description: 'Optional style hint (e.g. "photorealistic", "line art").' },
      size: { type: 'string', description: 'Optional size hint (e.g. "1024x1024", "16:9").' },
    },
    required: ['prompt'],
  },
};

export const GENERATE_AUDIO_TOOL: Anthropic.Tool = {
  name: 'generate_audio',
  description: 'Generate audio: text-to-speech narration, royalty-free music, or sound effect. Returns a URL to the produced MP3.',
  input_schema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['tts', 'music', 'sfx'], description: 'Kind of audio to produce.' },
      prompt: { type: 'string', description: 'Text to speak (tts) or description (music/sfx).' },
      voice: { type: 'string', description: 'Optional ElevenLabs voice id for tts.' },
      duration_sec: { type: 'number', description: 'Optional duration in seconds for music/sfx.' },
    },
    required: ['type', 'prompt'],
  },
};

export const GENERATE_VIDEO_TOOL: Anthropic.Tool = {
  name: 'generate_video',
  description: 'Compose a short video from a script, optional images, and optional TTS voiceover. Returns a URL to the produced MP4.',
  input_schema: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'Narration script / story outline.' },
      voiceover: { type: 'boolean', description: 'If true, a TTS voiceover is generated from the script.' },
      images: { type: 'array', items: { type: 'string' }, description: 'Optional image URLs (relative `/api/files/...`) to use as slides.' },
    },
    required: ['script'],
  },
};

export interface GenerationToolContext {
  imageService?: import('../../generation/images.js').ImageService;
  audioGenerationService?: GenerationAudioService;
  videoService?: VideoService;
  specialist: string;
}

export interface ToolInvocationResult {
  artifact: WorkflowStepArtifact;
  /** Short string fed back to the model as the tool_result content. */
  summary: string;
}

/**
 * Execute a tool_use block against the generation services. Returns the
 * produced artifact plus a compact summary string the LLM can cite in its
 * narration. Throws on missing services or provider failures.
 */
export async function runGenerationTool(
  name: string,
  input: Record<string, unknown>,
  ctx: GenerationToolContext,
): Promise<ToolInvocationResult> {
  if (name === 'generate_image') {
    if (!ctx.imageService) throw new Error('generate_image: image service not configured');
    const res = await ctx.imageService.generateImage({
      prompt: String(input.prompt ?? ''),
      style: input.style ? String(input.style) : undefined,
      size: input.size ? String(input.size) : undefined,
      specialist: ctx.specialist,
    });
    return {
      artifact: { type: 'image', url: res.url, meta: res.meta },
      summary: `image ready: ${res.url} (provider=${res.meta.provider}, ${res.meta.bytes}B)`,
    };
  }
  if (name === 'generate_audio') {
    if (!ctx.audioGenerationService) throw new Error('generate_audio: audio service not configured');
    const kind = String(input.type ?? 'tts') as 'tts' | 'music' | 'sfx';
    const prompt = String(input.prompt ?? '');
    const voice = input.voice ? String(input.voice) : undefined;
    const durationSec = typeof input.duration_sec === 'number' ? input.duration_sec : undefined;
    let res;
    if (kind === 'tts') res = await ctx.audioGenerationService.generateTTS({ prompt, voice, specialist: ctx.specialist });
    else if (kind === 'music') res = await ctx.audioGenerationService.generateMusic({ prompt, durationSec, specialist: ctx.specialist });
    else res = await ctx.audioGenerationService.generateSFX({ prompt, durationSec, specialist: ctx.specialist });
    return {
      artifact: { type: 'audio', url: res.url, meta: res.meta },
      summary: `audio ready (${kind}): ${res.url}`,
    };
  }
  if (name === 'generate_video') {
    if (!ctx.videoService) throw new Error('generate_video: video service not configured');
    const res = await ctx.videoService.generateVideo({
      script: String(input.script ?? ''),
      voiceover: !!input.voiceover,
      images: Array.isArray(input.images) ? (input.images as string[]) : undefined,
      specialist: ctx.specialist,
    });
    return {
      artifact: { type: 'video', url: res.url, meta: res.meta },
      summary: `video ready: ${res.url} (${res.meta.bytes}B, provider=${res.meta.provider})`,
    };
  }
  throw new Error(`unknown generation tool: ${name}`);
}

/** Pick the tool set a specialist is allowed to call. */
export function toolsForSpecialist(specialist: string): Anthropic.Tool[] {
  const s = specialist;
  if (s === 'المصمم' || s === 'architect' || s === 'المبدع' || s === 'creative') {
    return [GENERATE_IMAGE_TOOL, GENERATE_AUDIO_TOOL, GENERATE_VIDEO_TOOL];
  }
  if (s === 'السارد' || s === 'content-creator') {
    return [GENERATE_IMAGE_TOOL];
  }
  return [];
}

// Re-export the type for consumers who want it by path.
export type { ImageService };
