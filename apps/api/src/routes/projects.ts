import type { Hono } from 'hono';
import crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StoreData, ConvRecord, ProjectRecord, ProjectFile } from '../store/types.js';

export type { ProjectRecord } from '../store/types.js';

export interface ProjectsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  dataDir: string;
}

export function ensureProjectsArrayOn(store: StoreData) {
  if (!store.projects) store.projects = [];
  if (!store.pinnedConversations) store.pinnedConversations = [];
}

function projectDir(dataDir: string, projectId: string): string {
  return path.join(dataDir, 'projects', projectId);
}

function ensureProjectDir(dataDir: string, projectId: string): string {
  const dir = projectDir(dataDir, projectId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readProjectFile(dataDir: string, projectId: string, fileId: string): string | null {
  const filePath = path.join(projectDir(dataDir, projectId), fileId + '.txt');
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

/** Build project context string for system prompt injection */
export function buildProjectContext(project: ProjectRecord, dataDir: string, agentId?: string): string {
  let ctx = `\n\n## مشروع: ${project.name}`;
  if (project.description) ctx += `\n**الوصف:** ${project.description}`;
  if (project.instructions) ctx += `\n\n**تعليمات المشروع:**\n${project.instructions}`;

  if (agentId && project.agentInstructions?.[agentId]) {
    ctx += `\n\n**تعليمات خاصة بك في هذا المشروع:**\n${project.agentInstructions[agentId]}`;
  }

  if (project.files && project.files.length > 0) {
    const parts: string[] = [];
    for (const f of project.files.slice(0, 5)) {
      const content = readProjectFile(dataDir, project.id, f.id);
      if (content) parts.push(`### ${f.name}\n${content.slice(0, 2000)}${content.length > 2000 ? '\n...' : ''}`);
    }
    if (parts.length > 0) ctx += `\n\n**ملفات المشروع:**\n${parts.join('\n\n')}`;
  }

  return ctx;
}

export function registerProjectsRoutes(app: Hono, deps: ProjectsRoutesDeps): void {
  const { getStore, saveStore, dataDir } = deps;
  const ensure = () => ensureProjectsArrayOn(getStore());

  app.get('/api/projects', (c) => {
    ensure();
    const showArchived = c.req.query('archived') === 'true';
    const all = (getStore().projects || []) as ProjectRecord[];
    return c.json(showArchived ? all.filter(p => p.archived) : all.filter(p => !p.archived));
  });

  app.get('/api/projects/:id', (c) => {
    ensure();
    const p = (getStore().projects || []).find(p => p.id === c.req.param('id')) as ProjectRecord | undefined;
    return p ? c.json(p) : c.json({ error: 'not found' }, 404);
  });

  app.post('/api/projects', async (c) => {
    ensure();
    const store = getStore();
    const body = await c.req.json<Partial<ProjectRecord>>().catch(() => ({} as Partial<ProjectRecord>));
    if (!body.name?.trim()) return c.json({ error: 'name required' }, 400);
    const p: ProjectRecord = {
      id: 'prj-' + crypto.randomUUID().slice(0, 8),
      name: body.name.trim(),
      description: body.description,
      instructions: body.instructions,
      color: body.color || '#8b5cf6',
      icon: body.icon || 'folder',
      pinned: !!body.pinned,
      archived: false,
      defaultAgentId: body.defaultAgentId,
      files: [],
      agentInstructions: body.agentInstructions || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (store.projects as ProjectRecord[]).push(p);
    saveStore();
    return c.json(p, 201);
  });

  app.put('/api/projects/:id', async (c) => {
    ensure();
    const store = getStore();
    const id = c.req.param('id');
    const body = await c.req.json<Partial<ProjectRecord>>().catch(() => ({} as Partial<ProjectRecord>));
    const p = (store.projects as ProjectRecord[]).find(x => x.id === id);
    if (!p) return c.json({ error: 'not found' }, 404);
    // Don't overwrite immutable / managed fields
    const { id: _id, createdAt: _ca, files: _f } = body as ProjectRecord;
    void _id; void _ca; void _f;
    const safe = { ...body };
    delete (safe as Partial<ProjectRecord>).files;
    Object.assign(p, safe, { id: p.id, createdAt: p.createdAt, updatedAt: new Date().toISOString() });
    saveStore();
    return c.json(p);
  });

  app.put('/api/projects/:id/archive', (c) => {
    ensure();
    const p = (getStore().projects as ProjectRecord[]).find(x => x.id === c.req.param('id'));
    if (!p) return c.json({ error: 'not found' }, 404);
    p.archived = true; p.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(p);
  });

  app.put('/api/projects/:id/restore', (c) => {
    ensure();
    const p = (getStore().projects as ProjectRecord[]).find(x => x.id === c.req.param('id'));
    if (!p) return c.json({ error: 'not found' }, 404);
    p.archived = false; p.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(p);
  });

  app.delete('/api/projects/:id', (c) => {
    ensure();
    const store = getStore();
    const id = c.req.param('id');
    const idx = (store.projects as ProjectRecord[]).findIndex(x => x.id === id);
    if (idx === -1) return c.json({ error: 'not found' }, 404);
    for (const cv of (store.conversations || [])) {
      if ((cv as ConvRecord & { projectId?: string }).projectId === id)
        (cv as ConvRecord & { projectId?: string }).projectId = undefined;
    }
    (store.projects as ProjectRecord[]).splice(idx, 1);
    try {
      const dir = projectDir(dataDir, id);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
    } catch { /* ignore */ }
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/projects/:id/conversations', (c) => {
    ensure();
    const id = c.req.param('id');
    const convs = (getStore().conversations || [])
      .filter(cv => (cv as ConvRecord & { projectId?: string }).projectId === id && !cv.archived)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    return c.json(convs);
  });

  // ── Files ──────────────────────────────────────────────────────────

  app.post('/api/projects/:id/files', async (c) => {
    ensure();
    const store = getStore();
    const id = c.req.param('id');
    const p = (store.projects as ProjectRecord[]).find(x => x.id === id);
    if (!p) return c.json({ error: 'not found' }, 404);
    if (!p.files) p.files = [];
    if (p.files.length >= 20) return c.json({ error: 'max 20 files' }, 400);

    let fileName = 'file.txt';
    let content = '';

    const ct = c.req.header('content-type') || '';
    if (ct.includes('application/json')) {
      const body = await c.req.json<{ name: string; content: string }>().catch(() => ({ name: 'file.txt', content: '' }));
      fileName = body.name || 'file.txt';
      content = body.content || '';
    } else {
      const fd = await c.req.formData().catch(() => null);
      if (fd) {
        const file = fd.get('file') as File | null;
        if (file) { fileName = (fd.get('name') as string) || file.name; content = await file.text(); }
      }
    }

    if (!content.trim()) return c.json({ error: 'empty content' }, 400);

    const fileId = 'f-' + crypto.randomUUID().slice(0, 8);
    const dir = ensureProjectDir(dataDir, id);
    fs.writeFileSync(path.join(dir, fileId + '.txt'), content, 'utf-8');

    const pf: ProjectFile = {
      id: fileId, name: fileName,
      size: Buffer.byteLength(content),
      mimeType: 'text/plain',
      createdAt: new Date().toISOString(),
    };
    p.files.push(pf);
    p.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(pf, 201);
  });

  app.get('/api/projects/:id/files', (c) => {
    ensure();
    const p = (getStore().projects as ProjectRecord[]).find(x => x.id === c.req.param('id'));
    if (!p) return c.json({ error: 'not found' }, 404);
    return c.json(p.files || []);
  });

  app.get('/api/projects/:id/files/:fileId', (c) => {
    ensure();
    const { id, fileId } = c.req.param();
    const p = (getStore().projects as ProjectRecord[]).find(x => x.id === id);
    if (!p) return c.json({ error: 'not found' }, 404);
    const meta = p.files?.find(f => f.id === fileId);
    if (!meta) return c.json({ error: 'file not found' }, 404);
    return c.json({ ...meta, content: readProjectFile(dataDir, id, fileId) || '' });
  });

  app.delete('/api/projects/:id/files/:fileId', (c) => {
    ensure();
    const store = getStore();
    const { id, fileId } = c.req.param();
    const p = (store.projects as ProjectRecord[]).find(x => x.id === id);
    if (!p?.files) return c.json({ error: 'not found' }, 404);
    const idx = p.files.findIndex(f => f.id === fileId);
    if (idx === -1) return c.json({ error: 'file not found' }, 404);
    try {
      const fp = path.join(projectDir(dataDir, id), fileId + '.txt');
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch { /* ignore */ }
    p.files.splice(idx, 1);
    p.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true });
  });

  app.get('/api/projects/:id/context', (c) => {
    ensure();
    const p = (getStore().projects as ProjectRecord[]).find(x => x.id === c.req.param('id'));
    if (!p) return c.json({ error: 'not found' }, 404);
    const ctx = buildProjectContext(p, dataDir, c.req.query('agentId'));
    return c.json({ context: ctx, chars: ctx.length });
  });
}
