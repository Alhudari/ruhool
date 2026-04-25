/**
 * Zotero ↔ Vault bidirectional sync (phase 1: Zotero → Vault pull).
 *
 * For every vault note with a `zoteroItemKey` frontmatter field, we look
 * up the matching Zotero item. If Zotero has been modified more recently
 * than the vault note, we patch the note's frontmatter with the fresh
 * `tags` and `abstract`. If the vault was modified more recently we flag
 * it for conflict review — push-to-Zotero is intentionally deferred
 * because it requires a write-scoped API key and a schema mapping pass.
 *
 * The worker is safe to run repeatedly: each pass is idempotent. It
 * never deletes notes or items.
 */

import { promises as fs } from 'node:fs';
import {
  listNotes,
  readNote,
  parseFrontmatter,
  writeFrontmatter,
  splitFrontmatter,
  zoteroListItemsRich,
  zoteroListItemsRichWithVersion,
  zoteroPatchItemTags,
  ZoteroVersionConflictError,
} from '@ruhool/core';
import type { ZoteroItemRich } from '@ruhool/core';

export type SyncDirection = 'zotero-to-vault' | 'vault-to-zotero' | 'both';

export interface SyncStatus {
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunStats: SyncStats | null;
  running: boolean;
  // Last error captured on a failed run — cleared on next successful run.
  lastError: string | null;
}

export interface SyncStats {
  vaultNotesScanned: number;
  vaultNotesWithZoteroKey: number;
  zoteroItemsFetched: number;
  matched: number;
  updated: number;
  conflicts: number;
  missingInZotero: number;
  missingInVault: number;
  errors: number;
}

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stats: SyncStats;
  actions: SyncAction[];
}

export interface SyncAction {
  path: string;
  zoteroItemKey: string;
  kind: 'updated' | 'conflict' | 'no-change' | 'missing-in-zotero' | 'error';
  details?: string;
}

export interface SyncDeps {
  logger: { info: (m: string) => void; warn: (obj: { err: unknown }, m: string) => void; error?: (obj: { err: unknown }, m: string) => void };
  auditLog?: (entry: { action: string; source: string; meta?: Record<string, unknown> }) => void;
  onStatusUpdate?: (status: SyncStatus) => void;
  // Round 2 additions — all optional so the Round 1 test / callers that
  // don't pass them stay working. When `writeEnabled` is false, vault-newer
  // changes are only flagged (no push).
  dryRun?: boolean;
  writeEnabled?: boolean;
  writeConfig?: { userId: string; writeApiKey: string };
  deltaEnabled?: boolean;
  getLastZoteroVersion?: () => number;
  setLastZoteroVersion?: (v: number) => void;
  setLastDryRunPlan?: (plan: DryRunPlanItem[]) => void;
}

export interface DryRunPlanItem {
  path: string;
  zoteroItemKey: string;
  direction: 'zotero-to-vault' | 'vault-to-zotero';
  fields: string[];
}

// In-process status — persists across runs within a single API boot. The
// boot loader seeds it from store on first access; route handlers read
// and write it via getStatus/setStatus.
let status: SyncStatus = {
  lastRunAt: null,
  lastRunDurationMs: null,
  lastRunStats: null,
  running: false,
  lastError: null,
};

export function getSyncStatus(): SyncStatus {
  return { ...status };
}

export function seedSyncStatus(partial: Partial<SyncStatus>): void {
  status = { ...status, ...partial };
}

function setValueAndNotify(patch: Partial<SyncStatus>, onStatusUpdate?: SyncDeps['onStatusUpdate']): void {
  status = { ...status, ...patch };
  onStatusUpdate?.({ ...status });
}

/**
 * Update a note's frontmatter in place, preserving body + key order of
 * existing keys. New keys are appended in the order they appear in
 * `patch`. `null`/`undefined` values delete the key.
 */
async function patchFrontmatter(absPath: string, patch: Record<string, unknown>): Promise<void> {
  const raw = await fs.readFile(absPath, 'utf-8');
  const { yaml, body } = splitFrontmatter(raw);
  const parsed = parseFrontmatter(yaml);
  const data = { ...parsed.data };
  const keyOrder = [...parsed.keyOrder];
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) {
      delete data[k];
      const idx = keyOrder.indexOf(k);
      if (idx >= 0) keyOrder.splice(idx, 1);
      continue;
    }
    data[k] = v;
    if (!keyOrder.includes(k)) keyOrder.push(k);
  }
  const yamlBody = writeFrontmatter(data, keyOrder);
  // writeFrontmatter joins with \n but doesn't append a trailing newline.
  // We need `---\n<yaml>\n---\n` so the closing fence is on its own line.
  const block = `---\n${yamlBody}${yamlBody.endsWith('\n') ? '' : '\n'}---\n`;
  const content = yaml === ''
    ? `${block}${body}`
    : raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, block);
  await fs.writeFile(absPath, content, 'utf-8');
}

function tagsEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const ax = (a ?? []).map((t) => String(t).toLowerCase()).sort();
  const bx = (b ?? []).map((t) => String(t).toLowerCase()).sort();
  if (ax.length !== bx.length) return false;
  return ax.every((v, i) => v === bx[i]);
}

/** Run a single sync pass. Safe to call repeatedly. */
export async function runZoteroVaultSync(deps: SyncDeps): Promise<SyncReport> {
  if (status.running) {
    throw new Error('Sync already in progress');
  }
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  setValueAndNotify({ running: true, lastError: null }, deps.onStatusUpdate);

  const stats: SyncStats = {
    vaultNotesScanned: 0,
    vaultNotesWithZoteroKey: 0,
    zoteroItemsFetched: 0,
    matched: 0,
    updated: 0,
    conflicts: 0,
    missingInZotero: 0,
    missingInVault: 0,
    errors: 0,
  };
  const actions: SyncAction[] = [];

  const dryRunPlan: DryRunPlanItem[] = [];
  const isDryRun = !!deps.dryRun;
  const writeEnabled = !!deps.writeEnabled;
  const hasWriteConfig = !!(deps.writeConfig?.userId && deps.writeConfig?.writeApiKey);
  const canPush = writeEnabled && hasWriteConfig && !isDryRun;

  try {
    const notePaths = await listNotes({});
    stats.vaultNotesScanned = notePaths.length;

    // 1. Scan vault notes with zoteroItemKey.
    const notesWithKey: Array<{ rel: string; abs: string; mtime: number; key: string; frontmatter: Record<string, unknown> }> = [];
    for (const rel of notePaths) {
      try {
        const n = await readNote(rel);
        if (!n.zoteroItemKey) continue;
        notesWithKey.push({
          rel,
          abs: n.absPath,
          mtime: n.mtime,
          key: n.zoteroItemKey,
          frontmatter: n.frontmatter,
        });
      } catch (err) {
        stats.errors += 1;
        actions.push({ path: rel, zoteroItemKey: '', kind: 'error', details: err instanceof Error ? err.message : String(err) });
      }
    }
    stats.vaultNotesWithZoteroKey = notesWithKey.length;

    // 2. Fetch Zotero library. Use delta `?since=lastVersion` when enabled
    //    and we have a prior version; otherwise full pull. The returned
    //    libraryVersion is persisted for the next tick.
    const deltaEnabled = deps.deltaEnabled !== false;
    const since = deltaEnabled ? (deps.getLastZoteroVersion?.() ?? 0) : 0;
    let zoteroItems: ZoteroItemRich[];
    if (since > 0) {
      const withVer = await zoteroListItemsRichWithVersion({ since });
      zoteroItems = withVer.items;
      deps.setLastZoteroVersion?.(withVer.libraryVersion);
    } else {
      const withVer = await zoteroListItemsRichWithVersion({ since: 0 });
      zoteroItems = withVer.items;
      deps.setLastZoteroVersion?.(withVer.libraryVersion);
    }
    void zoteroListItemsRich; // keep export alive for legacy callers
    stats.zoteroItemsFetched = zoteroItems.length;
    const zoteroByKey = new Map<string, ZoteroItemRich>();
    for (const item of zoteroItems) {
      if (item.itemKey) zoteroByKey.set(item.itemKey, item);
    }

    // 3. Walk matched notes and sync.
    const matchedZoteroKeys = new Set<string>();
    for (const note of notesWithKey) {
      const z = zoteroByKey.get(note.key);
      if (!z) {
        stats.missingInZotero += 1;
        actions.push({ path: note.rel, zoteroItemKey: note.key, kind: 'missing-in-zotero' });
        continue;
      }
      stats.matched += 1;
      matchedZoteroKeys.add(note.key);

      const zoteroModified = z.dateModified ? new Date(z.dateModified).getTime() : 0;
      const vaultModified = note.mtime;
      const existingTags = Array.isArray(note.frontmatter.tags) ? note.frontmatter.tags as string[] : [];
      const existingAbstract = typeof note.frontmatter.abstract === 'string' ? note.frontmatter.abstract : '';

      const tagsChanged = !tagsEqual(existingTags, z.tags);
      const abstractChanged = existingAbstract.trim() !== z.abstractNote.trim();
      const hasUpstreamChange = tagsChanged || abstractChanged;

      if (!hasUpstreamChange) {
        actions.push({ path: note.rel, zoteroItemKey: note.key, kind: 'no-change' });
        continue;
      }

      // Conflict detection: if vault was modified AFTER the last Zotero
      // modification AND we also have upstream changes, it's a conflict.
      const isConflict = vaultModified > zoteroModified && zoteroModified > 0;
      // Vault-newer-only: user changed vault tags, Zotero didn't move.
      const vaultNewerOnly = vaultModified > zoteroModified && !isConflict;

      // Decide direction:
      //   - isConflict → pull + flag (same as Round 1).
      //   - vaultNewerOnly && tags changed && canPush → push to Zotero.
      //   - otherwise → pull (Round 1 behavior).
      const direction: 'zotero-to-vault' | 'vault-to-zotero' =
        vaultNewerOnly && tagsChanged && canPush ? 'vault-to-zotero' : 'zotero-to-vault';

      if (isDryRun) {
        dryRunPlan.push({
          path: note.rel,
          zoteroItemKey: note.key,
          direction,
          fields: [tagsChanged && 'tags', abstractChanged && 'abstract'].filter(Boolean) as string[],
        });
        actions.push({ path: note.rel, zoteroItemKey: note.key, kind: 'no-change', details: `dry-run ${direction}` });
        continue;
      }

      if (direction === 'vault-to-zotero') {
        try {
          // The Zotero item's `version` is on `z.itemKey`'s fetched entry —
          // we read it from the meta of the fetched ZoteroItemRich if the
          // upstream exposes it. ZoteroItemRich today doesn't carry
          // `version` so we'd need a short GET — but for the MVP we rely
          // on `If-Unmodified-Since-Version: 0` which Zotero accepts when
          // the item truly has no prior change. If that fails, the
          // VersionConflictError branch triggers a re-fetch.
          const version = (z as unknown as { version?: number }).version ?? 0;
          await zoteroPatchItemTags(note.key, existingTags, version, {
            writeConfig: deps.writeConfig!,
          });
          stats.updated += 1;
          actions.push({ path: note.rel, zoteroItemKey: note.key, kind: 'updated', details: 'pushed tags → Zotero' });
          deps.auditLog?.({
            action: 'zotero.write.ok',
            source: 'worker:zotero-vault-sync',
            meta: { itemKey: note.key, tagCount: existingTags.length, keyEnding: deps.writeConfig!.writeApiKey.slice(-4) },
          });
          continue;
        } catch (err) {
          if (err instanceof ZoteroVersionConflictError) {
            stats.conflicts += 1;
            actions.push({ path: note.rel, zoteroItemKey: note.key, kind: 'conflict', details: 'Zotero version moved; vault update deferred' });
            deps.auditLog?.({
              action: 'zotero.write.conflict',
              source: 'worker:zotero-vault-sync',
              meta: { itemKey: note.key, expected: err.expectedVersion },
            });
            // Fall through to pull so the vault reflects Zotero's latest.
          } else {
            stats.errors += 1;
            actions.push({ path: note.rel, zoteroItemKey: note.key, kind: 'error', details: err instanceof Error ? err.message : String(err) });
            continue;
          }
        }
      }

      try {
        const patch: Record<string, unknown> = {
          tags: z.tags,
          abstract: z.abstractNote,
          zoteroDateModified: z.dateModified,
          zoteroSyncedAt: new Date().toISOString(),
        };
        if (isConflict) {
          patch.zoteroSyncConflict = `Local modified ${new Date(vaultModified).toISOString()}; Zotero modified ${z.dateModified}. Review before saving further edits.`;
          stats.conflicts += 1;
        } else {
          patch.zoteroSyncConflict = null;
        }
        await patchFrontmatter(note.abs, patch);
        stats.updated += 1;
        actions.push({
          path: note.rel,
          zoteroItemKey: note.key,
          kind: isConflict ? 'conflict' : 'updated',
          details: [tagsChanged && 'tags', abstractChanged && 'abstract'].filter(Boolean).join(', '),
        });
      } catch (err) {
        stats.errors += 1;
        actions.push({ path: note.rel, zoteroItemKey: note.key, kind: 'error', details: err instanceof Error ? err.message : String(err) });
      }
    }

    // 4. Flag Zotero items that don't exist in the vault (informational only).
    const unmatched = zoteroItems.filter((z: ZoteroItemRich) => z.itemKey && !matchedZoteroKeys.has(z.itemKey));
    stats.missingInVault = unmatched.length;

    if (isDryRun && deps.setLastDryRunPlan) {
      deps.setLastDryRunPlan(dryRunPlan.slice(0, 200));
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    setValueAndNotify({
      running: false,
      lastRunAt: finishedAt,
      lastRunDurationMs: durationMs,
      lastRunStats: stats,
      lastError: null,
    }, deps.onStatusUpdate);

    deps.logger.info(
      `[zotero-vault-sync] done in ${durationMs}ms — matched=${stats.matched} updated=${stats.updated} conflicts=${stats.conflicts}`,
    );
    deps.auditLog?.({
      action: 'zotero-vault-sync.complete',
      source: 'worker:zotero-vault-sync',
      meta: { stats, durationMs },
    });

    return { startedAt, finishedAt, durationMs, stats, actions };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setValueAndNotify({
      running: false,
      lastError: msg,
    }, deps.onStatusUpdate);
    deps.logger.warn({ err }, '[zotero-vault-sync] failed');
    throw err;
  }
}

/** Schedule periodic sync. Interval is in milliseconds. Default 60 min. */
export function startZoteroVaultSyncScheduler(
  deps: SyncDeps & { intervalMs?: number; getEnabled?: () => boolean },
): NodeJS.Timeout {
  const interval = Math.max(deps.intervalMs ?? 60 * 60 * 1000, 5 * 60 * 1000);
  const tick = async () => {
    if (deps.getEnabled && !deps.getEnabled()) return;
    if (status.running) return;
    try {
      await runZoteroVaultSync(deps);
    } catch (err) {
      deps.logger.warn({ err }, '[zotero-vault-sync] scheduled run failed');
    }
  };
  // Delay first run to let boot settle.
  setTimeout(tick, 60 * 1000);
  return setInterval(tick, interval);
}
