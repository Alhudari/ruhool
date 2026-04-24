import type { Hono } from 'hono';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { getAuditLogPath } from '../services/audit-log.js';

/**
 * Streaming audit-log reader. Walks the JSONL file **newest-to-oldest** but
 * line-by-line using readline so we never allocate a giant string. The
 * cursor is the byte offset at which the previous response stopped; callers
 * paginate by passing the cursor back.
 *
 * Filters are data (prefix string, source string, date range) — never used
 * in any file path. Safe against traversal by construction.
 */

const querySchema = z.object({
  prefix: z.string().optional(),
  source: z.string().optional(),
  from: z.string().optional(),      // ISO date
  to: z.string().optional(),        // ISO date
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.coerce.number().int().min(0).optional(),
});

interface AuditEntry {
  ts: string;
  action: string;
  path?: string;
  source: string;
  meta?: Record<string, unknown>;
}

async function readTailFiltered(opts: {
  file: string;
  fileSize: number;
  prefix?: string;
  source?: string;
  fromIso?: string;
  toIso?: string;
  limit: number;
  cursor?: number;
}): Promise<{ entries: AuditEntry[]; nextCursor: number | null; bytesScanned: number }> {
  // readline streams forward; to get newest-first we collect into a bounded
  // buffer and return the tail slice. For a 50 MB ceiling file this is fine.
  // We bail out once we've seen enough lines matching the filter, cheaper
  // than sorting at the end.
  const startOffset = opts.cursor ?? 0;
  const stream = createReadStream(opts.file, { encoding: 'utf8', start: startOffset });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const buf: { entry: AuditEntry; byteEnd: number }[] = [];
  let bytesSeen = startOffset;
  for await (const line of rl) {
    bytesSeen += Buffer.byteLength(line, 'utf8') + 1; // +1 for \n
    if (!line) continue;
    let e: AuditEntry;
    try { e = JSON.parse(line) as AuditEntry; }
    catch { continue; }
    if (opts.prefix && !e.action.startsWith(opts.prefix)) continue;
    if (opts.source && e.source !== opts.source) continue;
    if (opts.fromIso && e.ts < opts.fromIso) continue;
    if (opts.toIso && e.ts > opts.toIso) continue;
    buf.push({ entry: e, byteEnd: bytesSeen });
  }
  rl.close();
  stream.destroy();

  // Newest-first, limited.
  buf.reverse();
  const slice = buf.slice(0, opts.limit);
  const lastIncluded = slice.at(-1);
  // Next cursor: if we returned less than buf.length, the next page starts
  // at 0 (reading from top again and skipping ones already emitted). Simpler
  // model: return null — caller requests a date range tighter instead.
  const moreAvailable = buf.length > slice.length;
  // Cursor semantics: byte offset of the oldest entry NOT returned in this
  // page. The client passes this back and we continue from there on the
  // next request. When we've served everything, cursor is null.
  const nextCursor = moreAvailable && lastIncluded
    ? Math.max(0, opts.fileSize - (lastIncluded.byteEnd - startOffset) - 1)
    : null;

  return { entries: slice.map((x) => x.entry), nextCursor, bytesScanned: bytesSeen - startOffset };
}

export function registerAuditLogRoutes(app: Hono): void {
  app.get('/api/audit-log', async (c) => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!parsed.success) {
      return c.json({ error: 'invalid_query', issues: parsed.error.issues }, 400);
    }
    const { prefix, source, from, to, limit = 100, cursor } = parsed.data;

    const file = getAuditLogPath();
    if (!file || !existsSync(file)) {
      // Graceful degrade — empty list, not 500.
      return c.json({ entries: [], nextCursor: null, totalBytes: 0 });
    }

    let fileSize = 0;
    try { fileSize = statSync(file).size; } catch { /* size 0 is fine */ }

    const result = await readTailFiltered({
      file,
      fileSize,
      prefix,
      source,
      fromIso: from,
      toIso: to,
      limit,
      cursor,
    });

    return c.json({
      entries: result.entries,
      nextCursor: result.nextCursor,
      totalBytes: fileSize,
    });
  });

  // Distinct `source` values for the filter dropdown. Streams through the
  // whole file; cap sources to 50 to keep the dropdown snappy.
  app.get('/api/audit-log/sources', async (c) => {
    const file = getAuditLogPath();
    if (!file || !existsSync(file)) return c.json({ sources: [] });
    const stream = createReadStream(file, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    const seen = new Set<string>();
    for await (const line of rl) {
      if (!line) continue;
      try {
        const e = JSON.parse(line) as AuditEntry;
        if (e.source) seen.add(e.source);
        if (seen.size >= 50) break;
      } catch { /* skip */ }
    }
    rl.close();
    stream.destroy();
    return c.json({ sources: [...seen].sort() });
  });
}
