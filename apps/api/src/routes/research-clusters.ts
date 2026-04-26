import type { Hono } from 'hono';
import crypto from 'node:crypto';
import type { StoreData, ResearchCluster, FileProvenance } from '../store/types.js';

function getClusters(store: StoreData): ResearchCluster[] {
  const s = store as unknown as { researchClusters?: ResearchCluster[] };
  if (!s.researchClusters) s.researchClusters = [];
  return s.researchClusters;
}

export function registerResearchClustersRoutes(app: Hono, deps: { getStore: () => StoreData; saveStore: () => void }) {
  const { getStore, saveStore } = deps;

  // GET /api/research/clusters
  app.get('/api/research/clusters', (c) => {
    const clusters = getClusters(getStore()).filter(cl => !cl.archived);
    return c.json({ clusters, total: clusters.length });
  });

  // POST /api/research/clusters
  app.post('/api/research/clusters', async (c) => {
    const store = getStore();
    const body = await c.req.json<Partial<ResearchCluster>>();
    if (!body.name?.trim()) return c.json({ error: 'name required' }, 400);
    const cluster: ResearchCluster = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      description: body.description,
      paths: body.paths ?? [],
      tags: body.tags,
      jurisdiction: body.jurisdiction,
      dimension: body.dimension,
      fileMetadata: {},
      zoteroKeys: body.zoteroKeys,
      zoteroCollectionKey: body.zoteroCollectionKey,
      notes: body.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    getClusters(store).push(cluster);
    saveStore();
    return c.json(cluster, 201);
  });

  // GET /api/research/clusters/:id
  app.get('/api/research/clusters/:id', (c) => {
    const cl = getClusters(getStore()).find(x => x.id === c.req.param('id'));
    if (!cl) return c.json({ error: 'not found' }, 404);
    return c.json(cl);
  });

  // PATCH /api/research/clusters/:id
  app.patch('/api/research/clusters/:id', async (c) => {
    const store = getStore();
    const cl = getClusters(store).find(x => x.id === c.req.param('id'));
    if (!cl) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json<Partial<ResearchCluster>>();
    Object.assign(cl, body, { id: cl.id, createdAt: cl.createdAt, updatedAt: new Date().toISOString() });
    saveStore();
    return c.json(cl);
  });

  // DELETE /api/research/clusters/:id (archive)
  app.delete('/api/research/clusters/:id', (c) => {
    const store = getStore();
    const cl = getClusters(store).find(x => x.id === c.req.param('id'));
    if (!cl) return c.json({ error: 'not found' }, 404);
    cl.archived = true;
    cl.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true });
  });

  // ── File provenance ──────────────────────────────────────────────

  // PUT /api/research/clusters/:id/files/provenance
  // Set or update provenance for a file
  app.put('/api/research/clusters/:id/files/provenance', async (c) => {
    const store = getStore();
    const cl = getClusters(store).find(x => x.id === c.req.param('id'));
    if (!cl) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json<FileProvenance & { path: string }>();
    if (!body.path) return c.json({ error: 'path required' }, 400);
    if (!cl.fileMetadata) cl.fileMetadata = {};
    cl.fileMetadata[body.path] = { ...body, addedAt: cl.fileMetadata[body.path]?.addedAt ?? new Date().toISOString() };
    cl.updatedAt = new Date().toISOString();
    saveStore();
    return c.json(cl.fileMetadata[body.path]);
  });

  // GET /api/research/clusters/:id/files/provenance?path=
  app.get('/api/research/clusters/:id/files/provenance', (c) => {
    const cl = getClusters(getStore()).find(x => x.id === c.req.param('id'));
    if (!cl) return c.json({ error: 'not found' }, 404);
    const path = c.req.query('path');
    if (path) {
      return c.json(cl.fileMetadata?.[path] ?? {});
    }
    return c.json({ fileMetadata: cl.fileMetadata ?? {}, total: Object.keys(cl.fileMetadata ?? {}).length });
  });

  // POST /api/research/clusters/:id/report
  app.post('/api/research/clusters/:id/report', async (c) => {
    const store = getStore();
    const cl = getClusters(store).find(x => x.id === c.req.param('id'));
    if (!cl) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json<{ report: string }>();
    cl.report = body.report;
    cl.reportUpdatedAt = new Date().toISOString();
    cl.updatedAt = new Date().toISOString();
    saveStore();
    return c.json({ ok: true });
  });
}
