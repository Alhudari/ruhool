import type { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import type { StoreData, ActivityRecord } from '../store/types.js';

export interface BackupsRoutesDeps {
  getStore: () => StoreData;
  saveStore: () => void;
  backupsDir: string;
  legacyRestoreDir: string;
  ensureBackupsDir: () => void;
  logActivity: (
    type: ActivityRecord['type'],
    action: string,
    details: string,
    opts?: { agentId?: string; metadata?: Record<string, unknown>; requestId?: string | null }
  ) => ActivityRecord;
}

/**
 * Store backup + restore routes.
 */
export function registerBackupsRoutes(app: Hono, deps: BackupsRoutesDeps): void {
  const { getStore, saveStore, backupsDir, legacyRestoreDir, ensureBackupsDir, logActivity } = deps;

  app.post('/api/backups', (c) => {
    const store = getStore();
    ensureBackupsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, 'backup-' + timestamp + '.json');
    fs.writeFileSync(backupFile, JSON.stringify(store, null, 2), 'utf-8');
    const stats = fs.statSync(backupFile);
    logActivity('backup', `Backup created`, `backup-${timestamp}.json (${(stats.size / 1024).toFixed(1)} KB)`, { metadata: { filename: 'backup-' + timestamp + '.json', size: stats.size } });
    return c.json({ id: timestamp, filename: 'backup-' + timestamp + '.json', createdAt: new Date().toISOString(), size: stats.size }, 201);
  });

  app.get('/api/backups', (c) => {
    ensureBackupsDir();
    const files = fs.readdirSync(backupsDir).filter((f) => f.startsWith('backup-') && f.endsWith('.json')).sort().reverse();
    return c.json(files.map((f) => {
      const stats = fs.statSync(path.join(backupsDir, f));
      return { id: f.replace('backup-', '').replace('.json', ''), filename: f, createdAt: stats.mtime.toISOString(), size: stats.size };
    }));
  });

  app.post('/api/backups/:id/restore', async (c) => {
    const store = getStore();
    const backupId = c.req.param('id');
    const backupFile = path.join(legacyRestoreDir, `${backupId}.json`);
    if (!fs.existsSync(backupFile)) return c.json({ error: 'Backup not found' }, 404);
    const data = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
    Object.assign(store, data);
    saveStore();
    return c.json({ ok: true, restored: backupId });
  });
}
