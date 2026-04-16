import type { Hono } from 'hono';
import type { StoreData, ActivityRecord, AgentPermissions } from '../store/types.js';

export interface PermissionsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  logActivity: (
    type: ActivityRecord['type'],
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null }
  ) => ActivityRecord;
  builtinAgentPermissions: Record<string, AgentPermissions>;
}

/**
 * Agent permissions GET/PUT routes.
 */
export function registerPermissionsRoutes(app: Hono, deps: PermissionsRoutesDeps): void {
  const { getStore, saveStore, logActivity, builtinAgentPermissions } = deps;

  app.get('/api/agents/:id/permissions', (c) => {
    const store = getStore();
    const agentId = c.req.param('id');
    if (builtinAgentPermissions[agentId]) {
      const overrides = store.permissionOverrides;
      if (overrides?.[agentId]) return c.json(overrides[agentId]);
      return c.json(builtinAgentPermissions[agentId]);
    }
    const customId = agentId.startsWith('custom-') ? agentId.replace('custom-', '') : agentId;
    const customAgent = store.customAgents.find((a) => a.id === customId);
    if (customAgent?.permissions) return c.json(customAgent.permissions);
    return c.json({
      canReadFiles: true, canWriteFiles: false, canSearch: false,
      canAccessInternet: false, canModifyAgents: false, canAccessPrivate: false,
    });
  });

  app.put('/api/agents/:id/permissions', async (c) => {
    const store = getStore();
    const agentId = c.req.param('id');
    const body = await c.req.json<AgentPermissions>();
    if (builtinAgentPermissions[agentId]) {
      if (!store.permissionOverrides) {
        store.permissionOverrides = {};
      }
      store.permissionOverrides[agentId] = body;
      saveStore();
      logActivity('system', `Permissions updated for ${agentId}`, JSON.stringify(body), { agentId });
      return c.json({ ok: true, permissions: body });
    }
    const customId = agentId.startsWith('custom-') ? agentId.replace('custom-', '') : agentId;
    const customAgent = store.customAgents.find((a) => a.id === customId);
    if (!customAgent) return c.json({ error: 'Agent not found' }, 404);
    customAgent.permissions = body;
    customAgent.updatedAt = new Date().toISOString();
    saveStore();
    logActivity('system', `Permissions updated for custom agent ${customAgent.name.en}`, JSON.stringify(body), { agentId: 'custom-' + customId });
    return c.json({ ok: true, permissions: body });
  });
}
