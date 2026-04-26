import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  zoteroPatchItemTags as patchItemTags,
  ZoteroVersionConflictError,
  zoteroReadItemVersion as readItemVersion,
} from '@ruhool/core';

const WRITE_CFG = { userId: '12345', writeApiKey: 'P9WRITEKEY' };

describe('zotero write-api', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('happy path — PATCH tags returns new version', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Last-Modified-Version': '10' },
    }));
    const r = await patchItemTags('ABCDEF12', ['tag1', 'tag2'], 5, { writeConfig: WRITE_CFG });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.newVersion).toBe(10);

    // Verify headers
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/12345/items/ABCDEF12');
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>)['Zotero-API-Key']).toBe(WRITE_CFG.writeApiKey);
    expect((init.headers as Record<string, string>)['If-Unmodified-Since-Version']).toBe('5');
  });

  it('412 → VersionConflictError', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 412 }));
    await expect(patchItemTags('KEY', [], 1, { writeConfig: WRITE_CFG }))
      .rejects.toBeInstanceOf(ZoteroVersionConflictError);
  });

  it('dry-run produces plan, never calls fetch', async () => {
    const r = await patchItemTags('KEY', ['a'], 0, { writeConfig: WRITE_CFG, dryRun: true });
    expect(r).toEqual({ ok: false, dryRun: true, would: { key: 'KEY', tags: ['a'] } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('missing credentials rejects', async () => {
    await expect(patchItemTags('K', [], 0, { writeConfig: { userId: '', writeApiKey: '' } }))
      .rejects.toThrow(/userId/);
  });

  it('readItemVersion parses version', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ version: 7 }), { status: 200 }));
    const v = await readItemVersion('K', { userId: '12345', apiKey: 'P9READ' });
    expect(v).toBe(7);
  });
});
