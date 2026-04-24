/**
 * Zotero write API. Only the tag PATCH path is exposed today — the
 * Vault → Zotero sync (Round 2) pushes vault-newer tag changes back.
 * Writes are gated by a separate write API key the user must explicitly
 * set; the read key is not reused.
 *
 * Contract:
 *   patchItemTags(key, tags, version, opts) returns { ok: true, newVersion }
 *   OR throws a `VersionConflictError` on 412 (caller should re-fetch).
 *
 * The endpoint uses `If-Unmodified-Since-Version` to enforce optimistic
 * concurrency. If the server's current version exceeds the version the
 * caller has seen, Zotero returns 412 and we surface it as a typed error
 * so the caller can re-read + retry exactly once.
 */

export class VersionConflictError extends Error {
  readonly itemKey: string;
  readonly expectedVersion: number;
  constructor(itemKey: string, expectedVersion: number) {
    super(`Zotero version conflict on ${itemKey} (expected ${expectedVersion})`);
    this.name = 'VersionConflictError';
    this.itemKey = itemKey;
    this.expectedVersion = expectedVersion;
  }
}

export interface WriteApiConfig {
  userId: string;
  writeApiKey: string;          // distinct from read key
}

/**
 * PATCH /items/{KEY} with just the tags array.
 *
 * NOTE: `writeApiKey` is **mutated** through the Zotero-Api-Key header
 * here because Zotero expects `Authorization` XOR the header variant.
 * We use the header variant to match the read-path pattern.
 */
export async function patchItemTags(
  key: string,
  tags: string[],
  version: number,
  opts: { writeConfig: WriteApiConfig; dryRun?: boolean },
): Promise<{ ok: true; newVersion: number } | { ok: false; dryRun: true; would: { key: string; tags: string[] } }> {
  if (opts.dryRun) {
    return { ok: false, dryRun: true, would: { key, tags } };
  }
  if (!opts.writeConfig.userId || !opts.writeConfig.writeApiKey) {
    throw new Error('Zotero write requires userId + writeApiKey');
  }
  const url = `https://api.zotero.org/users/${opts.writeConfig.userId}/items/${encodeURIComponent(key)}`;
  const body = {
    tags: tags.map((t) => ({ tag: t })),
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Zotero-API-Key': opts.writeConfig.writeApiKey,
      'If-Unmodified-Since-Version': String(version),
    },
    body: JSON.stringify(body),
  });
  if (res.status === 412) {
    throw new VersionConflictError(key, version);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Zotero PATCH ${res.status}: ${t.slice(0, 200)}`);
  }
  // Zotero returns the new Last-Modified-Version header on success.
  const newVersion = Number(res.headers.get('Last-Modified-Version') ?? version);
  return { ok: true, newVersion };
}

/** Read the current item version (GET /items/{KEY}) so callers can seed a PATCH. */
export async function readItemVersion(
  key: string,
  opts: { userId: string; apiKey: string },
): Promise<number> {
  const url = `https://api.zotero.org/users/${opts.userId}/items/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { 'Zotero-API-Key': opts.apiKey },
  });
  if (!res.ok) throw new Error(`Zotero GET ${res.status}`);
  const j = await res.json() as { version?: number };
  return j.version ?? 0;
}
