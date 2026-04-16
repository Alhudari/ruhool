import type { Hono } from 'hono';
import type { StoreData } from '../store/types.js';
import type { Phase2StoreLike, HierarchyNode } from '../phase2.js';

export interface HierarchyRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  setHierarchyNode: (store: Phase2StoreLike, node: { agentId: string; role: string; parentAgentId?: string; tokenBudget?: number }) => void;
}

/**
 * Hierarchy routes (REL-01 stage 2d).
 */
export function registerHierarchyRoutes(app: Hono, deps: HierarchyRoutesDeps): void {
  const { getStore, saveStore, setHierarchyNode } = deps;

  app.get('/api/hierarchy', (c) => c.json({ nodes: getStore().hierarchy || [] }));

  app.put('/api/hierarchy/:agentId', async (c) => {
    const store = getStore();
    const body = await c.req.json<Partial<HierarchyNode>>();
    setHierarchyNode(store as unknown as Phase2StoreLike, {
      agentId: c.req.param('agentId'),
      role: body.role || 'specialist',
      parentAgentId: body.parentAgentId,
      tokenBudget: body.tokenBudget,
    });
    saveStore();
    return c.json({ ok: true });
  });
}
