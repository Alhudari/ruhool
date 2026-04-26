/**
 * DEPRECATED FOR D-7 / Wave 1.
 *
 * This script targets the per-table Drizzle schema (providers, conversations,
 * messages, usage as separate tables) — NOT the Wave 1 single-row schema in
 * `apps/api/src/store/db-schema.sql` (one JSONB row in `app_state`). Running
 * this against a Wave 1 DB will create unrelated tables and leave the actual
 * `app_state` row untouched, so the API still boots empty.
 *
 * Wave 1 migration path: not needed for "start clean" deploys (Vercel boots
 * against an empty `app_state` row and fills naturally). For an explicit
 * one-off copy of a local JSON store into Wave 1's layout, use a 5-line
 * helper that calls `saveStoreToDb(JSON.parse(readFileSync(STORE_FILE)))`
 * with STORE_BACKEND=postgres + DATABASE_URL set.
 *
 * Original docstring (kept for context):
 *   One-time migration: copy providers, usage, conversations, and messages
 *   from `data/.store.json` into Postgres. Idempotent: rows whose primary
 *   key already exists are skipped.
 */
import fs from 'node:fs';
import { STORE_FILE } from '../config/paths.js';
import { getRepoDb } from '../store/repositories/db.js';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL must be set');
    process.exit(1);
  }
  if (!fs.existsSync(STORE_FILE)) {
    console.error('No store file found at', STORE_FILE);
    process.exit(1);
  }

  const db = getRepoDb();
  if (!db) {
    console.error('Failed to connect to Postgres');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as Record<string, unknown>;

  const { providers, apiUsage, conversations, messages } = await import('@ruhool/db');
  let pCount = 0;
  let uCount = 0;
  let cCount = 0;
  let mCount = 0;

  // ─── providers ───
  for (const p of (raw.providers as Array<Record<string, unknown>>) || []) {
    try {
      await db
        .insert(providers)
        .values({
          id: p.id as string,
          type: (p.type as string) ?? 'anthropic',
          displayName: (p.displayName as string) ?? 'provider',
          encryptedApiKey: (p.apiKey as string | null) ?? null,
          baseUrl: (p.baseUrl as string | null) ?? null,
          defaultModel: (p.defaultModel as string | null) ?? null,
          enabled: (p.enabled as boolean) ?? true,
          status: (p.status as string) ?? 'untested',
          lastTestAt: p.lastTestAt ? new Date(p.lastTestAt as string) : null,
          createdAt: p.createdAt ? new Date(p.createdAt as string) : new Date(),
          updatedAt: p.updatedAt ? new Date(p.updatedAt as string) : new Date(),
        })
        .onConflictDoNothing();
      pCount++;
    } catch (err) {
      console.warn('provider skip', p.id, err instanceof Error ? err.message : err);
    }
  }

  // ─── usage ───
  for (const u of (raw.usage as Array<Record<string, unknown>>) || []) {
    try {
      await db
        .insert(apiUsage)
        .values({
          id: u.id as string,
          timestamp: u.timestamp ? new Date(u.timestamp as string) : new Date(),
          provider: (u.provider as string) ?? 'anthropic',
          model: (u.model as string) ?? 'unknown',
          agentId: (u.agentId as string | null) ?? null,
          workflowId: (u.workflowId as string | null) ?? null,
          conversationId: (u.conversationId as string | null) ?? null,
          inputTokens: (u.inputTokens as number) ?? 0,
          outputTokens: (u.outputTokens as number) ?? 0,
          cachedTokens: (u.cachedTokens as number) ?? 0,
          inputCostUsd: (u.inputCostUsd as number) ?? 0,
          outputCostUsd: (u.outputCostUsd as number) ?? 0,
          totalCostUsd: (u.totalCostUsd as number) ?? 0,
          durationMs: (u.durationMs as number) ?? 0,
          success: (u.success as boolean) ?? true,
          error: (u.error as string | null) ?? null,
        })
        .onConflictDoNothing();
      uCount++;
    } catch (err) {
      console.warn('usage skip', u.id, err instanceof Error ? err.message : err);
    }
  }

  // ─── conversations ───
  for (const c of (raw.conversations as Array<Record<string, unknown>>) || []) {
    try {
      await db
        .insert(conversations)
        .values({
          id: c.id as string,
          title: (c.title as string | null) ?? null,
          language: (c.language as string) ?? 'en',
          agentId: (c.agentId as string | null) ?? null,
          archived: (c.archived as boolean) ?? false,
          createdAt: c.createdAt ? new Date(c.createdAt as string) : new Date(),
          updatedAt: c.updatedAt ? new Date(c.updatedAt as string) : new Date(),
        })
        .onConflictDoNothing();
      cCount++;
    } catch (err) {
      console.warn('conversation skip', c.id, err instanceof Error ? err.message : err);
    }
  }

  // ─── messages ───
  for (const m of (raw.messages as Array<Record<string, unknown>>) || []) {
    try {
      await db
        .insert(messages)
        .values({
          id: m.id as string,
          conversationId: m.conversationId as string,
          role: (m.role as string) ?? 'user',
          content: (m.content as string) ?? '',
          agentId: (m.agentId as string | null) ?? null,
          toolCallsJson: (m.toolCalls as unknown[] | undefined) ?? null,
          toolResultsJson: (m.toolResults as unknown[] | undefined) ?? null,
          createdAt: m.createdAt ? new Date(m.createdAt as string) : new Date(),
        })
        .onConflictDoNothing();
      mCount++;
    } catch (err) {
      console.warn('message skip', m.id, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nMigrated: ${pCount} providers, ${uCount} usage rows, ${cCount} conversations, ${mCount} messages`);
  process.exit(0);
}

main().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
