import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ensureDataDir } from '../config/paths.js';
import { logger } from '../server/logging.js';

/**
 * AES-256-GCM encryption for secrets at rest (provider apiKey, etc.).
 *
 * Key derivation priority:
 *   1. `ENCRYPTION_KEY` env var — hex (64 chars) or >=32-char passphrase (sha256'd).
 *   2. `DATA_DIR/.encryption-key` — random 32-byte key, generated once, 0600.
 *
 * Ciphertext format: `enc:v1:` + base64(iv[12] | tag[16] | ct).
 */

const ENCRYPTION_KEY_FILE = path.join(DATA_DIR, '.encryption-key');

export function getOrCreateEncryptionKey(): Buffer {
  const fromEnv = process.env.ENCRYPTION_KEY;
  if (fromEnv && fromEnv.length >= 32) {
    if (/^[0-9a-f]{64}$/i.test(fromEnv)) return Buffer.from(fromEnv, 'hex');
    return crypto.createHash('sha256').update(fromEnv).digest();
  }
  ensureDataDir();
  if (fs.existsSync(ENCRYPTION_KEY_FILE)) {
    return Buffer.from(fs.readFileSync(ENCRYPTION_KEY_FILE, 'utf-8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(ENCRYPTION_KEY_FILE, key.toString('hex'), { encoding: 'utf-8', mode: 0o600 });
  try { fs.chmodSync(ENCRYPTION_KEY_FILE, 0o600); } catch { /* Windows: best-effort */ }
  logger.warn({ path: ENCRYPTION_KEY_FILE }, '[sec] ENCRYPTION_KEY not set — generated one');
  return key;
}

export const ENC_KEY = getOrCreateEncryptionKey();
export const ENC_PREFIX = 'enc:v1:';

export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  if (plain.startsWith(ENC_PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(value: string | null): string | null {
  if (!value) return value;
  if (!value.startsWith(ENC_PREFIX)) return value;
  try {
    const raw = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf-8');
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[sec] Failed to decrypt secret');
    return null;
  }
}
