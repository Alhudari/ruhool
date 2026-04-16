import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const execAsync = promisify(exec);
import { fixRemotionCode as fixCode } from './code-fixer.js';
const STUDIO_DIR = path.resolve(import.meta.dirname || '.', '../../studio');
const OUTPUT_DIR = path.resolve(import.meta.dirname || '.', '../../../data/videos');
const META_FILE = path.join(OUTPUT_DIR, '_renders.json');
const CHUNK_FRAMES = 300;

interface RenderOptions { code: string; width?: number; height?: number; fps?: number; durationInFrames?: number; outputFormat?: 'mp4' | 'gif' | 'webm'; source?: string; tool?: string; title?: string; description?: string; startFrame?: number; endFrame?: number; }
interface RenderResult { ok: boolean; outputPath?: string; filename?: string; error?: string; durationMs?: number; }
interface RenderMeta { id: string; filename: string; format: string; width: number; height: number; fps: number; durationInFrames: number; renderedAt: string; renderDurationMs: number; sizeBytes: number; archived?: boolean; source?: string; tool?: string; title?: string; description?: string; }

function loadMeta(): RenderMeta[] { try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')); } catch { return []; } }
function saveMeta(a: RenderMeta[]) { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); fs.writeFileSync(META_FILE, JSON.stringify(a, null, 2)); }
function addMeta(e: RenderMeta) { const a = loadMeta(); a.unshift(e); saveMeta(a); }

export function archiveRender(id: string, archived = true): boolean {
  const a = loadMeta();
  const item = a.find(r => r.id === id);
  if (!item) return false;
  item.archived = archived;
  saveMeta(a);
  return true;
}

export function deleteRender(id: string): boolean {
  const a = loadMeta();
  const idx = a.findIndex(r => r.id === id);
  if (idx === -1) return false;
  const [item] = a.splice(idx, 1);
  const p = path.join(OUTPUT_DIR, item.filename);
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
  saveMeta(a);
  return true;
}

function setup(code: string, dur: number, fps: number, w: number, h: number) {
  const id = crypto.randomUUID().slice(0, 8);
  const compId = `R${id}`;
  // Render INSIDE the studio project so relative imports ('../../assets/…') + public/ resolve,
  // and Remotion correctly detects apps/studio as the project root.
  const tmpDir = path.join(STUDIO_DIR, 'src', 'compositions', `_render_${id}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Find component name (kept for future use — see scheduler)
  let _comp = 'MyVideo';
  const m = code.match(/export\s+default\s+(?:function\s+)?(\w+)/);
  if (m) _comp = m[1];
  else { const all = [...code.matchAll(/(?:const|function)\s+([A-Z]\w+)/g)]; if (all.length) _comp = all[all.length - 1][1]; }
  void _comp;

  // Fix code before writing
  const { fixed } = fixCode(code);

  const compFile = path.join(tmpDir, 'Comp.tsx');
  fs.writeFileSync(compFile, fixed, 'utf-8');

  // Write entry
  const entryFile = path.join(tmpDir, 'entry.tsx');
  fs.writeFileSync(entryFile, `import{registerRoot,Composition}from'remotion';import C from'./Comp';registerRoot(()=>(<Composition id="${compId}" component={C} durationInFrames={${dur}} fps={${fps}} width={${w}} height={${h}}/>));`, 'utf-8');

  // No need to symlink node_modules or public — we're already inside the real studio project.

  return { id, compId, tmpDir, entryFile, compFile };
}

export async function renderVideo(options: RenderOptions): Promise<RenderResult> {
  if (!options.code?.trim()) return { ok: false, error: 'Empty code' };
  const w = options.width || 1080, h = options.height || 1920, fps = options.fps || 30;
  const totalFrames = options.durationInFrames || 150;
  const fmt = options.outputFormat || 'mp4';
  const ext = fmt === 'gif' ? 'gif' : fmt === 'webm' ? 'webm' : 'mp4';
  const codec = fmt === 'gif' ? 'gif' : fmt === 'webm' ? 'vp8' : 'h264';
  // Trim range (for GIF/selected region export)
  const sf = Math.max(0, options.startFrame ?? 0);
  const ef = Math.min(totalFrames - 1, options.endFrame ?? totalFrames - 1);
  const trimFrames = ef - sf + 1;
  const hasTrim = sf > 0 || ef < totalFrames - 1;
  const { id, compId, tmpDir, entryFile } = setup(options.code, totalFrames, fps, w, h);
  const outputFile = path.join(OUTPUT_DIR, `${id}.${ext}`);
  const start = Date.now();

  try {
    if (fmt === 'gif' || fmt === 'webm' || hasTrim) {
      // GIF/WebM or trimmed range — always single-pass with --frames (GIF can't be concatenated cleanly)
      const framesArg = hasTrim ? ` --frames=${sf}-${ef}` : (fmt === 'gif' ? ` --frames=0-${Math.min(totalFrames - 1, 150)}` : '');
      await execAsync(
        `npx remotion render "${entryFile}" ${compId} "${outputFile}" --codec ${codec} --concurrency=2${framesArg}`,
        { cwd: tmpDir, timeout: 180_000 }
      );
    } else if (totalFrames <= CHUNK_FRAMES) {
      // Short — single render (non-blocking)
      await execAsync(`npx remotion render "${entryFile}" ${compId} "${outputFile}" --codec h264 --concurrency=2`, { cwd: tmpDir, timeout: 120_000 });
    } else {
      // Long — chunk + concat
      const chunks: string[] = [];
      for (let f = 0; f < totalFrames; f += CHUNK_FRAMES) {
        const end = Math.min(f + CHUNK_FRAMES - 1, totalFrames - 1);
        const cf = path.join(tmpDir, `c${chunks.length}.mp4`);
        try {
          await execAsync(`npx remotion render "${entryFile}" ${compId} "${cf}" --codec h264 --concurrency=2 --frames=${f}-${end}`, { cwd: tmpDir, timeout: 120_000 });
          chunks.push(cf);
        } catch (err: unknown) {
          const stderr = (err && typeof err === 'object' && 'stderr' in err) ? String((err as {stderr:string}).stderr).split('\n').find(l => /Error/.test(l)) || '' : '';
          // Save debug
          fs.mkdirSync(path.join(OUTPUT_DIR, 'debug'), { recursive: true });
          try { fs.copyFileSync(path.join(tmpDir, 'Comp.tsx'), path.join(OUTPUT_DIR, 'debug', 'last-failed.tsx')); } catch {}
          throw new Error(`Chunk failed (frames ${f}-${end}): ${stderr}`);
        }
      }
      // Concat
      const listFile = path.join(tmpDir, 'list.txt');
      fs.writeFileSync(listFile, chunks.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
      await execAsync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}"`, { timeout: 60_000 });
    }

    const ms = Date.now() - start;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    const sz = fs.statSync(outputFile).size;
    const finalFrames = (fmt === 'gif' || fmt === 'webm' || hasTrim) ? trimFrames : totalFrames;
    addMeta({ id, filename: `${id}.${ext}`, format: ext, width: w, height: h, fps, durationInFrames: finalFrames, renderedAt: new Date().toISOString(), renderDurationMs: ms, sizeBytes: sz, source: options.source, tool: options.tool, title: options.title, description: options.description });
    return { ok: true, outputPath: outputFile, filename: `${id}.${ext}`, durationMs: ms };
  } catch (err: unknown) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    const msg = err instanceof Error ? err.message : 'Render failed';
    return { ok: false, error: msg.slice(0, 500) };
  }
}

export async function renderPreview(options: RenderOptions): Promise<{ ok: boolean; imagePath?: string; filename?: string; error?: string }> {
  if (!options.code?.trim()) return { ok: false, error: 'Empty' };
  const { id, compId, tmpDir, entryFile } = setup(options.code, options.durationInFrames || 150, options.fps || 30, options.width || 1080, options.height || 1920);
  const out = path.join(OUTPUT_DIR, `p${id}.png`);
  try {
    await execAsync(`npx remotion still "${entryFile}" ${compId} "${out}" --frame 0`, { cwd: tmpDir, timeout: 30_000 });
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    return { ok: true, imagePath: out, filename: `p${id}.png` };
  } catch (err: unknown) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : 'Failed' };
  }
}

export function listRenders(): RenderMeta[] { return loadMeta(); }
export function getVideoPath(f: string): string | null { const p = path.join(OUTPUT_DIR, f); return fs.existsSync(p) ? p : null; }
