/**
 * Auto-backup scheduler — daily snapshot of vault + platform data.
 *
 *   GET  /api/backups/auto                — list snapshots
 *   POST /api/backups/auto                — manual trigger snapshot
 *   GET  /api/backups/auto/settings       — get retention + interval
 *   PUT  /api/backups/auto/settings       — update settings
 *   DELETE /api/backups/auto/:filename    — remove a snapshot
 */
import type { Hono } from 'hono';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import archiver from 'archiver';
import { getVaultRoot } from '@ruhool/core';
import type { StoreData } from '../store/types.js';
import { auditLog } from '../services/audit-log.js';

interface Deps {
  getStore: () => StoreData;
  backupsDir: string;
}

export interface AutoBackupSettings {
  enabled: boolean;
  intervalHours: number;     // default 24
  retentionDays: number;     // delete older than this
  lastRunAt?: string;
}

const SETTINGS_FILE = 'auto-backup-settings.json';

let activeTimer: ReturnType<typeof setInterval> | null = null;

async function loadSettings(backupsDir: string): Promise<AutoBackupSettings> {
  const file = path.join(backupsDir, SETTINGS_FILE);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw) as AutoBackupSettings;
  } catch {
    return { enabled: true, intervalHours: 24, retentionDays: 30 };
  }
}

async function saveSettings(backupsDir: string, s: AutoBackupSettings): Promise<void> {
  await fsp.mkdir(backupsDir, { recursive: true });
  await fsp.writeFile(path.join(backupsDir, SETTINGS_FILE), JSON.stringify(s, null, 2), 'utf8');
}

async function runSnapshot(backupsDir: string, store: StoreData): Promise<{ filename: string; bytes: number }> {
  await fsp.mkdir(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `auto-snapshot-${stamp}.zip`;
  const outPath = path.join(backupsDir, filename);

  // Try Zotero snapshot before opening the archive (so we can await it cleanly)
  let zoteroData: { collections?: unknown; items?: unknown } = {};
  try {
    const { zoteroListCollections, zoteroListItems } = await import('@ruhool/core');
    zoteroData.collections = await zoteroListCollections();
    zoteroData.items = await zoteroListItems(undefined, 500);
  } catch { /* Zotero not running — skip */ }

  return await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    out.on('close', () => resolve({ filename, bytes: archive.pointer() }));
    archive.on('error', reject);
    archive.pipe(out);

    const vaultRoot = getVaultRoot();
    if (fs.existsSync(vaultRoot)) {
      archive.directory(vaultRoot, 'vault');
    }
    archive.append(JSON.stringify(store, null, 2), { name: 'ruhool/store.json' });
    if (zoteroData.collections) archive.append(JSON.stringify(zoteroData.collections, null, 2), { name: 'zotero/collections.json' });
    if (zoteroData.items)       archive.append(JSON.stringify(zoteroData.items, null, 2),       { name: 'zotero/items.json' });
    archive.append(JSON.stringify({
      type: 'auto-snapshot',
      createdAt: new Date().toISOString(),
      vaultRoot,
      hasZotero: !!zoteroData.collections,
    }, null, 2), { name: 'manifest.json' });
    archive.finalize();
  });
}

async function purgeOld(backupsDir: string, retentionDays: number): Promise<number> {
  const files = await fsp.readdir(backupsDir).catch(() => []);
  const cutoff = Date.now() - retentionDays * 86400_000;
  let purged = 0;
  for (const f of files) {
    if (!f.startsWith('auto-snapshot-') || !f.endsWith('.zip')) continue;
    const fp = path.join(backupsDir, f);
    try {
      const stat = await fsp.stat(fp);
      if (stat.mtimeMs < cutoff) {
        await fsp.unlink(fp);
        purged++;
      }
    } catch { /* skip */ }
  }
  return purged;
}

export function registerAutoBackupRoutes(app: Hono, deps: Deps): void {
  // Boot the scheduler
  (async () => {
    const settings = await loadSettings(deps.backupsDir);
    if (settings.enabled && !activeTimer) {
      const intervalMs = Math.max(1, settings.intervalHours) * 3600_000;
      activeTimer = setInterval(async () => {
        try {
          const result = await runSnapshot(deps.backupsDir, deps.getStore());
          settings.lastRunAt = new Date().toISOString();
          await saveSettings(deps.backupsDir, settings);
          const purged = await purgeOld(deps.backupsDir, settings.retentionDays);
          await auditLog({ action: 'backup.auto', source: 'platform:auto', meta: { ...result, purged } });
        } catch (err) {
          await auditLog({ action: 'backup.auto.failed', source: 'platform:auto', meta: { error: String(err) } });
        }
      }, intervalMs);
    }
  })();

  app.get('/api/backups/auto', async (c) => {
    const files = await fsp.readdir(deps.backupsDir).catch(() => []);
    const snapshots = await Promise.all(
      files.filter((f) => f.startsWith('auto-snapshot-') && f.endsWith('.zip')).map(async (f) => {
        const fp = path.join(deps.backupsDir, f);
        const stat = await fsp.stat(fp);
        return { filename: f, mtime: stat.mtimeMs, sizeKB: Math.round(stat.size / 1024) };
      }),
    );
    snapshots.sort((a, b) => b.mtime - a.mtime);
    return c.json({ snapshots, total: snapshots.length });
  });

  app.post('/api/backups/auto', async (c) => {
    try {
      const result = await runSnapshot(deps.backupsDir, deps.getStore());
      const settings = await loadSettings(deps.backupsDir);
      const purged = await purgeOld(deps.backupsDir, settings.retentionDays);
      await auditLog({ action: 'backup.manual', source: 'platform:user', meta: { ...result, purged } });
      return c.json({ ok: true, ...result, purged });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/backups/auto/settings', async (c) => {
    return c.json(await loadSettings(deps.backupsDir));
  });

  app.put('/api/backups/auto/settings', async (c) => {
    const body = await c.req.json<Partial<AutoBackupSettings>>();
    const current = await loadSettings(deps.backupsDir);
    const next = { ...current, ...body };
    await saveSettings(deps.backupsDir, next);
    // Reset timer if interval/enabled changed
    if (activeTimer) { clearInterval(activeTimer); activeTimer = null; }
    if (next.enabled) {
      const intervalMs = Math.max(1, next.intervalHours) * 3600_000;
      activeTimer = setInterval(async () => {
        try {
          await runSnapshot(deps.backupsDir, deps.getStore());
          next.lastRunAt = new Date().toISOString();
          await saveSettings(deps.backupsDir, next);
        } catch { /* ignore */ }
      }, intervalMs);
    }
    return c.json(next);
  });

  app.delete('/api/backups/auto/:filename', async (c) => {
    const fn = c.req.param('filename');
    if (!fn.startsWith('auto-snapshot-') || !fn.endsWith('.zip')) {
      return c.json({ error: 'invalid filename' }, 400);
    }
    try {
      await fsp.unlink(path.join(deps.backupsDir, fn));
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
}
