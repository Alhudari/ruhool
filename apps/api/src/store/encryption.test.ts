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

// R15-#12 round-trip: verify every sensitive field defined in
// `loadStore`/`saveStore` survives encrypt-on-write → decrypt-on-read
// unchanged. This catches regressions where a new field is added to
// one side but not the other.
describe('store secret round-trip', () => {
  it('encrypts and restores all 7 sensitive field categories', async () => {
    const enc = await import('./encryption.js');
    const fields: Record<string, string> = {
      'providers[0].apiKey':           'sk-ant-test-provider',
      'resend.apiKey':                 're_test_resend',
      'googleTasks.clientSecret':      'goog-client-secret',
      'googleTasks.refreshToken':      'goog-refresh-token',
      'googleTasks.accessToken':       'goog-access-token',
      'apiKeys.openai':                'sk-openai-test',
      'notifications.smtpPass':        'smtp-pw-test',
      'notifications.slackWebhookUrl': 'https://hooks.slack.com/test',
    };
    for (const [label, plain] of Object.entries(fields)) {
      const ct = enc.encryptSecret(plain);
      expect(ct, label).toMatch(/^enc:v1:/);
      expect(ct, label).not.toContain(plain);
      expect(enc.decryptSecret(ct), label).toBe(plain);
    }
  });
});
