/**
 * Providers repository — dual-mode (Drizzle + Postgres OR JSON fallback).
 *
 * The JSON store remains authoritative for local dev (no DATABASE_URL set).
 * When DATABASE_URL is present, reads/writes are issued to Postgres via Drizzle
 * and the JSON store is updated in parallel so existing callers that read the
 * in-memory `store.providers` array still see fresh data.
 *
 * `apiKey` is stored *encrypted* (prefixed `enc:v1:`) both in JSON and Postgres.
 */
import { getRepoDb } from './db.js';
import { logger } from '../../server/logging.js';

export interface ProviderRecord {
  id: string;
  type: string;
  displayName: string;
  apiKey: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  enabled: boolean;
  status: string;
  lastTestAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JsonStoreLike {
  providers: ProviderRecord[];
}

export async function listProviders(json: JsonStoreLike): Promise<ProviderRecord[]> {
  const db = getRepoDb();
  if (!db) return json.providers;
  try {
    const { providers } = await import('@ruhool/db');
    const rows = await db.select().from(providers);
    return rows.map(rowToRecord);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, '[providers.repo] DB read failed, falling back to JSON');
    return json.providers;
  }
}

export async function getProvider(json: JsonStoreLike, id: string): Promise<ProviderRecord | null> {
  const db = getRepoDb();
  if (!db) return json.providers.find((p) => p.id === id) || null;
  try {
    const { providers } = await import('@ruhool/db');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
    return rows[0] ? rowToRecord(rows[0]) : null;
  } catch {
    return json.providers.find((p) => p.id === id) || null;
  }
}

export async function upsertProvider(json: JsonStoreLike, rec: ProviderRecord): Promise<void> {
  // Always update JSON (in-memory store stays authoritative for consumers)
  const existingIdx = json.providers.findIndex((p) => p.id === rec.id);
  if (existingIdx >= 0) json.providers[existingIdx] = rec;
  else json.providers.push(rec);

  const db = getRepoDb();
  if (!db) return;
  try {
    const { providers } = await import('@ruhool/db');
    await db
      .insert(providers)
      .values(recordToRow(rec))
      .onConflictDoUpdate({ target: providers.id, set: recordToRow(rec) });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, '[providers.repo] DB write failed (JSON OK)');
  }
}

export async function deleteProvider(json: JsonStoreLike, id: string): Promise<void> {
  json.providers = json.providers.filter((p) => p.id !== id);
  const db = getRepoDb();
  if (!db) return;
  try {
    const { providers } = await import('@ruhool/db');
    const { eq } = await import('drizzle-orm');
    await db.delete(providers).where(eq(providers.id, id));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, '[providers.repo] DB delete failed (JSON OK)');
  }
}

// ─── mappers ───

interface DbProviderRow {
  id: string;
  type: string;
  displayName: string;
  encryptedApiKey: string | null;
  baseUrl: string | null;
  defaultModel: string | null;
  enabled: boolean;
  status: string;
  lastTestAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToRecord(r: DbProviderRow): ProviderRecord {
  return {
    id: r.id,
    type: r.type,
    displayName: r.displayName,
    apiKey: r.encryptedApiKey,
    baseUrl: r.baseUrl,
    defaultModel: r.defaultModel,
    enabled: r.enabled,
    status: r.status,
    lastTestAt: r.lastTestAt ? r.lastTestAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function recordToRow(r: ProviderRecord) {
  return {
    id: r.id,
    type: r.type,
    displayName: r.displayName,
    encryptedApiKey: r.apiKey,
    baseUrl: r.baseUrl,
    defaultModel: r.defaultModel,
    enabled: r.enabled,
    status: r.status,
    lastTestAt: r.lastTestAt ? new Date(r.lastTestAt) : null,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}
