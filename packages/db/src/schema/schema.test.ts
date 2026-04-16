import { describe, it, expect } from 'vitest';
import { providers } from './providers.js';
import { conversations } from './conversations.js';
import { apiUsage } from './api-usage.js';

describe('drizzle schema shape', () => {
  it('providers table has expected columns', () => {
    const cols = Object.keys(providers);
    expect(cols).toContain('id');
    expect(cols).toContain('type');
    expect(cols).toContain('encryptedApiKey');
    expect(cols).toContain('enabled');
  });

  it('conversations table exposes columns', () => {
    const cols = Object.keys(conversations);
    expect(cols.length).toBeGreaterThan(0);
    expect(cols).toContain('id');
  });

  it('apiUsage table exposes columns', () => {
    const cols = Object.keys(apiUsage);
    expect(cols.length).toBeGreaterThan(0);
  });
});
