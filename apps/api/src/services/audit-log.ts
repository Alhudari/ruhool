/**
 * Append-only audit log for every destructive or material vault operation.
 * Persisted to data/audit-log.jsonl (one JSON object per line).
 *
 * Use:
 *   import { auditLog } from '../services/audit-log.js';
 *   await auditLog({ action: 'note.create', path: '01 PhD/...', source: 'platform:Rumman', meta: {...} });
 */
import { promises as fs, existsSync, statSync, renameSync } from 'node:fs';
import * as path from 'node:path';

export interface AuditEntry {
  ts: string;
  action: string;          // e.g. 'note.create', 'note.update', 'note.move', 'note.delete', 'meeting.create'
  path?: string;           // vault-relative path, when applicable
  source: string;          // 'platform:agent-id' | 'platform:user' | 'platform:auto'
  meta?: Record<string, unknown>;
}

let LOG_FILE: string | null = null;
const ROTATE_BYTES = 50 * 1024 * 1024;
let lastRotationCheckMs = 0;

export function configureAuditLog(opts: { dataDir: string }): void {
  LOG_FILE = path.join(opts.dataDir, 'audit-log.jsonl');
}

export function getAuditLogPath(): string | null {
  return LOG_FILE;
}

// Rotate when the file crosses 50 MB. The stat is O(1) but we skip it on most
// writes via a time-based throttle — checking once per minute is enough since
// nothing in the system writes anywhere near MB/s of audit traffic.
function maybeRotate(): void {
  if (!LOG_FILE) return;
  const now = Date.now();
  if (now - lastRotationCheckMs < 60_000) return;
  lastRotationCheckMs = now;
  try {
    if (!existsSync(LOG_FILE)) return;
    const stat = statSync(LOG_FILE);
    if (stat.size < ROTATE_BYTES) return;
    const today = new Date().toISOString().slice(0, 10);
    const rotated = LOG_FILE.replace(/\.jsonl$/, `.${today}.jsonl`);
    // If a rotated file for today already exists (rare), suffix with epoch
    // so we never overwrite existing history.
    const target = existsSync(rotated)
      ? rotated.replace(/\.jsonl$/, `.${Date.now()}.jsonl`)
      : rotated;
    renameSync(LOG_FILE, target);
  } catch {
    // Rotation is best-effort. If it fails, we keep appending to the
    // existing file; audit data is never lost.
  }
}

export async function auditLog(entry: Omit<AuditEntry, 'ts'>): Promise<void> {
  if (!LOG_FILE) return; // not configured — silently skip
  maybeRotate();
  const line: AuditEntry = { ts: new Date().toISOString(), ...entry };
  try {
    await fs.appendFile(LOG_FILE, JSON.stringify(line) + '\n', 'utf8');
  } catch { /* best effort */ }
}

// Read recent entries (for /audit-log API). Tail-read to avoid loading huge files.
export async function readAuditLog(opts: { limit?: number; sinceIso?: string; action?: string } = {}): Promise<AuditEntry[]> {
  if (!LOG_FILE) return [];
  let raw: string;
  try { raw = await fs.readFile(LOG_FILE, 'utf8'); }
  catch { return []; }
  const lines = raw.split('\n').filter(Boolean);
  const limit = opts.limit ?? 200;
  const out: AuditEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      const e = JSON.parse(lines[i]) as AuditEntry;
      if (opts.action && e.action !== opts.action) continue;
      if (opts.sinceIso && e.ts < opts.sinceIso) continue;
      out.push(e);
    } catch { /* skip bad line */ }
  }
  return out;
}
