import { describe, it, expect } from 'vitest';
import { containsSecrets, assertCommandSafe, isPrivatePath, FORBIDDEN_COMMANDS } from './safety.js';

describe('safety.containsSecrets', () => {
  it('detects Anthropic sk-ant- keys', () => {
    expect(containsSecrets('key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz12345')).toBe(true);
  });
  it('detects generic sk- keys', () => {
    expect(containsSecrets('sk-abcdefghijklmnopqrstuvwxyz0123456789')).toBe(true);
  });
  it('detects OpenAI sk-proj- style (generic sk- pattern)', () => {
    expect(containsSecrets('sk-proj-abcdefghijklmnopqrstuvwxyz12345')).toBe(true);
  });
  it('detects Google AIza keys', () => {
    expect(containsSecrets('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456')).toBe(true);
  });
  it('detects GitHub ghp_ tokens', () => {
    expect(containsSecrets('ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ')).toBe(true);
  });
  it('returns false for benign content', () => {
    expect(containsSecrets('hello world')).toBe(false);
  });
});

describe('safety.assertCommandSafe', () => {
  it('throws on taskkill', () => {
    expect(() => assertCommandSafe('taskkill /F /IM node.exe')).toThrow(/SAFETY/);
  });
  it('throws on rm -rf /', () => {
    expect(() => assertCommandSafe('rm -rf /')).toThrow();
  });
  it('allows safe commands', () => {
    expect(() => assertCommandSafe('ls -la')).not.toThrow();
  });
  it('has non-empty forbidden list', () => {
    expect(FORBIDDEN_COMMANDS.length).toBeGreaterThan(0);
  });
});

describe('safety.isPrivatePath', () => {
  it('returns boolean', () => {
    expect(typeof isPrivatePath('/tmp/foo')).toBe('boolean');
  });
});
