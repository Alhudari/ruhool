import type { Hono } from 'hono';
import { bootReport } from '../server/boot.js';
import { getSyncStatus } from '../workers/zotero-vault-sync.js';

export interface HealthDeps {
  serviceHealth: Record<string, unknown>;
}

/**
 * GET /api/health — always open (no auth). Used as a deploy-time readiness
 * probe and as the /audit page's connectivity check. Never leaks secrets.
 */
export function registerHealthRoutes(app: Hono, deps: HealthDeps): void {
  app.get('/api/health', (c) => {
    const syncStatus = getSyncStatus();
    const overallOk = bootReport.postgres !== 'failed'
      && bootReport.schedule !== 'failed'
      && bootReport.watcher !== 'failed';
    return c.json({
      ok: overallOk,
      status: overallOk ? 'ok' : 'degraded',
      name: 'Ruhool',
      version: '0.3.0',
      buildRound: 'R9-R18',
      agents: 19,
      services: deps.serviceHealth,
      workers: {
        postgres: bootReport.postgres,
        temporal: bootReport.temporal,
        schedule: bootReport.schedule,
        zoteroRefresh: bootReport.zoteroRefresh,
        zoteroVaultSync: bootReport.zoteroVaultSync,
        watcher: bootReport.watcher,
        research: bootReport.research,
        reasons: bootReport.reasons,
      },
      vault: {
        rootDetected: bootReport.vaultRootDetected,
      },
      zoteroSync: {
        running: syncStatus.running,
        lastRunAt: syncStatus.lastRunAt,
        lastError: syncStatus.lastError,
      },
      dispatch: {
        enabled: process.env.ENABLE_HIERARCHICAL_DISPATCH === 'true',
      },
      zotero: {
        writeEnabled: process.env.ENABLE_ZOTERO_WRITE === 'true' || !!(deps as unknown as { storeFlags?: { zoteroWriteEnabled?: boolean } }).storeFlags?.zoteroWriteEnabled,
        deltaEnabled: process.env.ENABLE_ZOTERO_DELTA_SYNC !== 'false',
      },
      uptimeMs: Date.now() - bootReport.startedAtMs,
      timestamp: new Date().toISOString(),
    });
  });
}
