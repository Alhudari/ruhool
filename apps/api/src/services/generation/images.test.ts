import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createImageService, NoProviderError } from './images.js';

describe('generation/images', () => {
  let tmpDir: string;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruhool-img-'));
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('throws NoProviderError when no keys are present', async () => {
    const svc = createImageService({ getApiKey: () => undefined, dataDir: tmpDir });
    await expect(
      svc.generateImage({ prompt: 'a cat', specialist: 'المصمم' }),
    ).rejects.toBeInstanceOf(NoProviderError);
  });

  it('uses Stability AI first, writes PNG, returns /api/files/ url + meta', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    global.fetch = vi.fn(async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;

    const svc = createImageService({
      getApiKey: (f) => (f === 'stabilityApiKey' ? 'sk-test' : undefined),
      dataDir: tmpDir,
    });
    const res = await svc.generateImage({ prompt: 'an eagle', specialist: 'المصمم', style: 'photo', size: '1:1' });
    expect(res.url).toMatch(/^\/api\/files\/images\/generated\/.+\.png$/);
    expect(res.meta.provider).toBe('stability');
    expect(res.meta.bytes).toBe(png.length);
    expect(res.meta.specialist).toBe('المصمم');

    // File really landed on disk.
    const onDisk = path.join(tmpDir, 'images', 'generated', res.meta.filename);
    expect(fs.existsSync(onDisk)).toBe(true);
  });
});
