import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';

// Set env before importing encryption module.
beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  }
});

describe('encryption round-trip', () => {
  it('encrypts and decrypts a string', async () => {
    const mod = await import('./encryption.js');
    const plain = 'sk-ant-api03-secret-value-123';
    const ct = mod.encryptSecret(plain);
    expect(ct).toMatch(/^enc:v1:/);
    expect(ct).not.toContain(plain);
    expect(mod.decryptSecret(ct)).toBe(plain);
  });

  it('returns unchanged if already encrypted', async () => {
    const mod = await import('./encryption.js');
    const ct = mod.encryptSecret('hello');
    expect(mod.encryptSecret(ct)).toBe(ct);
  });

  it('returns null for null input', async () => {
    const mod = await import('./encryption.js');
    expect(mod.decryptSecret(null)).toBeNull();
  });

  it('passes through unencrypted values', async () => {
    const mod = await import('./encryption.js');
    expect(mod.decryptSecret('plain-value')).toBe('plain-value');
  });
});
