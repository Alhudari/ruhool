# Artifact generation pipeline (Phase 5)

The Ruhool workflow orchestrator lets tool-granted specialists produce real
images, audio, and video inside a workflow step. This document covers the
architecture, provider detection, cost tracking, and how to extend the
pipeline with a new provider.

## High-level flow

```
user request
   │
   ▼
 الراعي (planner, tool_use plan_workflow)
   │
   ▼
 workflow_runs + workflow_steps rows (pending)
   │
   ▼
 orchestrator.executeStep ─────► specialists.dispatch
                                     │
                                     ├─ emits tool_use → runGenerationTool
                                     │      │
                                     │      ├─ imageService.generateImage
                                     │      ├─ audioGenerationService.generateTTS / Music / SFX
                                     │      └─ videoService.generateVideo
                                     │
                                     └─ artifacts[] returned, persisted on
                                        workflow_steps.artifacts, streamed
                                        over SSE to the dashboard
```

## File paths

| Layer            | File                                                             |
| ---------------- | ---------------------------------------------------------------- |
| Image service    | `apps/api/src/services/generation/images.ts`                     |
| Audio service    | `apps/api/src/services/generation/audio.ts`                      |
| Video service    | `apps/api/src/services/generation/video.ts`                      |
| Tool schemas     | `apps/api/src/services/agents/tools/generation-tools.ts`         |
| Dispatcher       | `apps/api/src/services/agents/specialists.ts`                    |
| File server      | `apps/api/src/routes/generated-files.ts`                         |
| Output roots     | `data/images/generated/`, `data/audio/generated/`, `data/videos/generated/` |

All artifact URLs returned to the dashboard are relative
`/api/files/:kind/generated/:filename` paths. The file server enforces
bearer auth globally (via `registerBearerAuth`) and guards against path
traversal with a strict `[A-Za-z0-9._-]+` regex on the filename.

## Specialist tool grants

| Specialist | Tools                                       |
| ---------- | ------------------------------------------- |
| المصمم     | generate_image, generate_audio, generate_video |
| الكرييتف   | generate_image, generate_audio, generate_video |
| الدبسا     | generate_image                              |
| everyone else | (text-only)                              |

See `toolsForSpecialist` in `generation-tools.ts`.

## Image provider detection order

1. **Stability AI** (`stabilityApiKey`, fallback `stableAudioKey`) —
   `stable-image-core`, $0.03 estimate.
2. **fal.ai** (`falApiKey`) — defaults to `fal-ai/flux/schnell`, $0.01 estimate.
3. **OpenAI DALL·E 3** (`openaiApiKey`) — 1024x1024, $0.04 estimate.
4. **Google Imagen** (`googleApiKey` / `geminiApiKey`) — `imagen-3.0-generate-001`, $0.04 estimate.

If none is configured, `NoProviderError` is raised and the dispatcher
surfaces it as an `is_error: true` tool_result (and ultimately as a step
error). The dashboard renders the error verbatim.

## Audio providers

Audio reuses the existing `AudioService`:

- **TTS** → ElevenLabs `eleven_multilingual_v2`, MP3.
- **Music** → Stability `stable-audio-2` text-to-audio (max 47s), MP3.
- **SFX** → ElevenLabs sound-generation, MP3.

Failure to obtain bytes (null return) raises `NoAudioProviderError`.

## Video composition

1. If `REMOTION_STUDIO_URL` is set, `POST /render` with
   `{ script, images, voiceover }` and expect MP4 bytes back. Any non-OK
   response falls through to the ffmpeg path silently.
2. ffmpeg path:
   - If `voiceover: true` and images are provided, generate TTS via the
     audio service first.
   - Concatenate images (3s each) into a 1280x720 slideshow with
     `concat` demuxer, scale+pad, `libx264`, `yuv420p`, 30fps.
   - Mux the voiceover (aac, `-shortest`) if present.
   - No images → blank black slide with voiceover (5s default).
3. If ffmpeg is missing, `NoFfmpegError` is thrown with an install hint.

## Cost tracking

Each `GenerateImageResult.meta.costUsd` carries a best-estimate cost. The
dispatcher logs `{ specialist, provider, model, durationMs, costUsd,
bytes }` per call. Cost accumulation onto `workflow_runs.totalCostUsd` is
a next-phase integration (current Phase 5 scope stops at per-call logging
and per-step `usage.costUsd` which remains 0 until cost rollup lands).

## Per-step timeout + retry surface (G7, G8)

- `workflow_steps.timeout_ms` — per-step deadline, default 1h. Enforced
  by `executeStep` via `Promise.race` with a `setTimeout`.
- `workflow_steps.attempt_count` / `max_attempts` — incremented on each
  `executeStep` entry. When > 1 the orchestrator emits a
  `workflow-step-update` event so the dashboard badge reads
  "Attempt X/Y".

## Adding a new image provider

1. Add an `async function generateViaNewProvider(...)` in `images.ts`
   returning `{ bytes, model, costUsd }`.
2. Add the key lookup + branch inside `generateImage` at the desired
   priority. Put the new branch ABOVE a weaker provider so it wins the
   detection order when both keys are present.
3. Update the provider detection table in this document.

## Adding a new specialist with tools

1. Add its Arabic + English keys to the `toolsForSpecialist` table in
   `generation-tools.ts`.
2. No other wiring needed — the dispatcher picks up the grant
   automatically via the table lookup.

## Failure surfaces

| Situation                        | User sees                                             |
| -------------------------------- | ----------------------------------------------------- |
| No image keys                    | Step fails: "no image generation keys configured..." |
| ffmpeg missing                   | Step fails: "ffmpeg not found on PATH..."            |
| Provider HTTP non-2xx            | Step fails: `"stability 401: ..."`, full text relayed |
| Step overruns `timeoutMs`        | Step fails: `"step timeout after <ms>ms"`             |
| Transient error + retry          | Step card shows `Attempt 2/3` in amber                |

All of the above keep the SSE channel healthy so the dashboard can
distinguish per-step failure from a run-level crash.
