/**
 * Canvas — Obsidian-compatible .canvas JSON files.
 * Saves to `01 PhD/09 Canvas/{name}.canvas` so they're readable in Obsidian
 * Canvas plugin AND in our platform's canvas viewer.
 *
 * .canvas spec: https://jsoncanvas.org
 *
 *   GET    /api/canvas              — list canvases
 *   GET    /api/canvas/:name        — read one
 *   PUT    /api/canvas/:name        — create/replace
 *   DELETE /api/canvas/:name        — remove
 */
import type { Hono } from 'hono';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getVaultRoot } from '@ruhool/core';
import { auditLog } from '../services/audit-log.js';

const CANVAS_DIR = '01 PhD/09 Canvas';

interface CanvasNode {
  id: string;
  type: 'text' | 'file' | 'link' | 'group' | 'image' | 'youtube' | 'video';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  color?: string;
  label?: string;
  // Optional rich-media fields
  src?: string;       // for image/video
  videoId?: string;   // for youtube
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toNode: string;
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  color?: string;
  label?: string;
}

interface CanvasFile {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export function registerCanvasRoutes(app: Hono): void {

  app.get('/api/canvas', async (c) => {
    const dir = path.join(getVaultRoot(), CANVAS_DIR);
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.canvas'));
    } catch { /* dir may not exist yet */ }
    return c.json({
      canvases: await Promise.all(files.map(async (f) => {
        try {
          const stat = await fs.stat(path.join(dir, f));
          return { name: f.replace(/\.canvas$/, ''), filename: f, mtime: stat.mtimeMs };
        } catch { return null; }
      })).then((arr) => arr.filter(Boolean)),
    });
  });

  app.get('/api/canvas/:name', async (c) => {
    const name = c.req.param('name');
    const file = path.join(getVaultRoot(), CANVAS_DIR, `${name}.canvas`);
    try {
      const raw = await fs.readFile(file, 'utf8');
      return c.json(JSON.parse(raw));
    } catch (err) {
      if (String(err).includes('ENOENT')) return c.json({ error: 'Not found' }, 404);
      return c.json({ error: String(err) }, 500);
    }
  });

  app.put('/api/canvas/:name', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json<CanvasFile>();
    const safe = name.replace(/[\\/:*?"<>|]/g, '-');
    const dir = path.join(getVaultRoot(), CANVAS_DIR);
    const file = path.join(dir, `${safe}.canvas`);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(body, null, 2), 'utf8');
      await auditLog({ action: 'canvas.save', path: `${CANVAS_DIR}/${safe}.canvas`, source: 'platform:user', meta: { nodes: body.nodes?.length ?? 0, edges: body.edges?.length ?? 0 } });
      return c.json({ ok: true, path: `${CANVAS_DIR}/${safe}.canvas` });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // Generate a canvas from an AI prompt (Abdan researches + structures).
  // Body: { name, prompt, layout? }
  // Sends prompt to Abdan via /api/chat (server-internal), parses JSON nodes.
  app.post('/api/canvas/generate-from-prompt', async (c) => {
    const body = await c.req.json<{ name: string; prompt: string; layout?: 'grid' | 'circle' }>();
    if (!body.name || !body.prompt?.trim()) return c.json({ error: 'name + prompt required' }, 400);

    // Build a STRICT JSON instruction — wrapped in custom markers we can extract reliably
    const instruction = `مهمتك: ابني JSON واحد لكانفاس بصري. **لا تكتب شرحاً قبل أو بعد JSON. لا تستخدم \`\`\`code blocks\`\`\`.** ابدأ ردّك مباشرةً بالعلامة \`<<CANVAS_JSON>>\` ثم JSON ثم \`<<END>>\`.

التنسيق الإلزامي:
<<CANVAS_JSON>>
{"nodes":[{"type":"text","title":"عنوان النقطة","content":"الشرح المختصر بدون اقتباسات داخلية"},{"type":"link","title":"اسم المرجع","url":"https://example.com","content":"وصف قصير"}]}
<<END>>

شروط:
- بين 5 و 12 عقدة
- استخدم type: "text" أو "link" فقط
- اهرب من علامات الاقتباس الداخلية بـ backslash إذا اضطررت
- اكتب JSON على سطر واحد بدون breaks
- خلطة من text و link، روابط لمصادر حقيقية إن وُجدت

الموضوع: ${body.prompt}`;

    try {
      // Call manager/research agent via the same chat API
      const port = (process.env.APP_PORT || '3001');
      // F-013: forward auth so loopback works under production fail-closed
      const apiToken = process.env.RUHOOL_API_TOKEN;
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Ruhool-Chat-V2': '0' };
      if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;
      const res = await fetch(`http://localhost:${port}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: instruction,
          agentId: 'research',
          language: 'ar',
        }),
      });

      // Read SSE stream
      let fullText = '';
      const reader = res.body?.getReader();
      if (!reader) return c.json({ error: 'no stream' }, 500);
      const decoder = new TextDecoder();
      let buf = '';
      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        let event = 'message';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            try {
              if (event === 'text') {
                const d = JSON.parse(data) as { content?: string };
                fullText += d.content ?? '';
              }
              if (event === 'done') break readLoop;
            } catch { /* skip */ }
            event = 'message';
          }
        }
      }

      // Extract JSON — try multiple strategies, in order of reliability:
      let parsed: { nodes: Array<{ type: string; title?: string; content?: string; url?: string }> } | null = null;
      let extractError: string | null = null;

      // Strategy 1: our custom markers
      const markerMatch = fullText.match(/<<CANVAS_JSON>>([\s\S]*?)<<END>>/);
      if (markerMatch) {
        try { parsed = JSON.parse(markerMatch[1].trim()); }
        catch (e) { extractError = `marker JSON parse failed: ${e}`; }
      }

      // Strategy 2: ```json fence
      if (!parsed) {
        const fenceMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (fenceMatch) {
          try { parsed = JSON.parse(fenceMatch[1].trim()); extractError = null; }
          catch (e) { extractError = (extractError ?? '') + ` | fence parse failed: ${e}`; }
        }
      }

      // Strategy 3: greedy outer { ... } match for first object containing "nodes"
      if (!parsed) {
        // Find first { followed eventually by "nodes" — bracket-balance to find matching }
        const start = fullText.indexOf('{');
        if (start >= 0) {
          let depth = 0;
          let end = -1;
          let inString = false;
          let escape = false;
          for (let i = start; i < fullText.length; i++) {
            const ch = fullText[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
          }
          if (end > start) {
            const candidate = fullText.slice(start, end + 1);
            try { parsed = JSON.parse(candidate); extractError = null; }
            catch (e) { extractError = (extractError ?? '') + ` | bracket-balance parse failed: ${e}`; }
          }
        }
      }

      if (!parsed || !Array.isArray(parsed.nodes)) {
        return c.json({
          error: 'AI response did not contain valid JSON with a `nodes` array',
          extractError,
          rawResponse: fullText.slice(0, 800),
          hint: 'Try a more specific prompt or simpler topic',
        }, 500);
      }

      // Convert to canvas nodes
      const layout = body.layout ?? 'grid';
      const cols = Math.ceil(Math.sqrt(parsed.nodes.length));
      const W = 260, H = 140, GAP_X = 60, GAP_Y = 60;
      const canvasNodes: CanvasNode[] = parsed.nodes.map((n, i) => {
        let x: number, y: number;
        if (layout === 'circle') {
          const angle = (i / parsed.nodes.length) * 2 * Math.PI;
          const r = 200 + parsed.nodes.length * 12;
          x = Math.cos(angle) * r;
          y = Math.sin(angle) * r;
        } else {
          const row = Math.floor(i / cols);
          const col = i % cols;
          x = col * (W + GAP_X);
          y = row * (H + GAP_Y);
        }
        const isLink = n.type === 'link' && n.url;
        return {
          id: crypto.randomUUID(),
          type: isLink ? 'link' : 'text',
          x, y,
          width: W,
          height: H,
          text: !isLink ? `**${n.title ?? ''}**\n\n${n.content ?? ''}` : undefined,
          url: isLink ? n.url : undefined,
          label: n.title,
        };
      });

      // Save
      const safe = body.name.replace(/[\\/:*?"<>|]/g, '-');
      const dir = path.join(getVaultRoot(), CANVAS_DIR);
      const fp = path.join(dir, `${safe}.canvas`);
      await fs.mkdir(dir, { recursive: true });
      const canvasFile: CanvasFile = { nodes: canvasNodes, edges: [] };
      await fs.writeFile(fp, JSON.stringify(canvasFile, null, 2), 'utf8');
      await auditLog({
        action: 'canvas.generate-ai',
        path: `${CANVAS_DIR}/${safe}.canvas`,
        source: 'platform:user',
        meta: { prompt: body.prompt.slice(0, 100), nodeCount: canvasNodes.length },
      });

      return c.json({ ok: true, name: safe, nodeCount: canvasNodes.length });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Generate a canvas from a list of vault file paths.
  // Body: { name, files: string[], layout?: 'grid' | 'circle' }
  app.post('/api/canvas/generate-from-files', async (c) => {
    const body = await c.req.json<{ name: string; files: string[]; layout?: 'grid' | 'circle' }>();
    if (!body.name || !body.files?.length) return c.json({ error: 'name + files required' }, 400);
    const layout = body.layout ?? 'grid';

    const nodes: CanvasNode[] = [];
    const cols = Math.ceil(Math.sqrt(body.files.length));
    const W = 220, H = 100, GAP_X = 60, GAP_Y = 50;

    body.files.forEach((file, i) => {
      let x: number, y: number;
      if (layout === 'circle') {
        const angle = (i / body.files.length) * 2 * Math.PI;
        const radius = 120 + body.files.length * 15;
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;
      } else {
        const row = Math.floor(i / cols);
        const col = i % cols;
        x = col * (W + GAP_X);
        y = row * (H + GAP_Y);
      }
      nodes.push({
        id: crypto.randomUUID(),
        type: 'file',
        x, y,
        width: W,
        height: H,
        file,
      });
    });

    const canvasFile: CanvasFile = { nodes, edges: [] };
    const safe = body.name.replace(/[\\/:*?"<>|]/g, '-');
    const dir = path.join(getVaultRoot(), CANVAS_DIR);
    const fp = path.join(dir, `${safe}.canvas`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fp, JSON.stringify(canvasFile, null, 2), 'utf8');
    await auditLog({ action: 'canvas.generate', path: `${CANVAS_DIR}/${safe}.canvas`, source: 'platform:user', meta: { fileCount: body.files.length, layout } });

    return c.json({ ok: true, name: safe, path: `${CANVAS_DIR}/${safe}.canvas`, nodeCount: nodes.length });
  });

  app.delete('/api/canvas/:name', async (c) => {
    const name = c.req.param('name');
    const file = path.join(getVaultRoot(), CANVAS_DIR, `${name}.canvas`);
    try {
      await fs.unlink(file);
      await auditLog({ action: 'canvas.delete', path: `${CANVAS_DIR}/${name}.canvas`, source: 'platform:user' });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
}
