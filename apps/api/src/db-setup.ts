/**
 * PostgreSQL Database Setup & Migration for Ruhool Platform
 *
 * Connection: localhost:5432, user: ruhool, pass: ruhool_dev, db: ruhool
 *
 * Usage:
 *   import { setupDatabase, migrateFromJsonToPostgres } from './db-setup';
 *   await setupDatabase();
 *   await migrateFromJsonToPostgres(); // one-time migration from .store.json
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './server/logging.js';

const { Pool } = pg;

const PG_PASSWORD = process.env.PG_PASSWORD || 'ruhool_dev';
if (process.env.NODE_ENV === 'production' && PG_PASSWORD === 'ruhool_dev') {
  // SEC-10 (AUDIT.md): refuse to boot prod with the dev default.
  throw new Error(
    'SECURITY: PG_PASSWORD is set to the default "ruhool_dev" in production. Set a strong password.'
  );
}

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'ruhool',
  password: PG_PASSWORD,
  database: process.env.PG_DATABASE || 'ruhool',
});

// ─── Schema Creation ───

const CREATE_TABLES_SQL = `
-- Providers (LLM providers like Anthropic)
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  api_key TEXT,
  base_url TEXT,
  default_model TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'unconfigured',
  last_test_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  language TEXT NOT NULL DEFAULT 'en',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- Agents (custom user-created agents)
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'bot',
  color TEXT NOT NULL DEFAULT '#666',
  skills TEXT[] DEFAULT '{}',
  tools TEXT[] DEFAULT '{}',
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Memories (agent memory tiers)
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('working', 'short-term', 'long-term')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);

-- Papers (uploaded academic PDFs)
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  authors TEXT NOT NULL DEFAULT '',
  pages INTEGER NOT NULL DEFAULT 0,
  text_length INTEGER NOT NULL DEFAULT 0,
  sections JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notes (annotations on papers)
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  section TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('claim', 'evidence', 'method', 'critique', 'question', 'connection')),
  content TEXT NOT NULL,
  themes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notes_paper ON notes(paper_id);

-- API Usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Workflows
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL DEFAULT 'Untitled',
  name_ar TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  steps JSONB NOT NULL DEFAULT '[]',
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  trigger_cron TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom agents (alias for agents table — kept as separate concept)
CREATE TABLE IF NOT EXISTS custom_agents (
  id TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'bot',
  color TEXT NOT NULL DEFAULT '#666',
  skills TEXT[] DEFAULT '{}',
  tools TEXT[] DEFAULT '{}',
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Settings (key-value store for app settings)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function setupDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(CREATE_TABLES_SQL);
    logger.info('[db-setup] All tables created successfully.');
  } catch (err) {
    logger.error({ err }, '[db-setup] Error creating tables');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Migration from JSON store ───
// DEPRECATED FOR D-7 / Wave 1 — this function targets a legacy relational
// schema (providers / conversations / messages as separate tables). Wave 1
// uses a single `app_state(id, data jsonb, updated_at)` row instead, so
// the inserts below would write to tables that don't exist in the Wave 1
// schema. Kept for historical reference only.
//
// To migrate a local JSON store to the Wave 1 layout, write a small one-off
// that reads `data/.store.json` and runs `saveStoreToDb(parsed)` directly
// (with STORE_BACKEND=postgres + DATABASE_URL set). For Abdullah's "start
// clean" preference (D-7 prompt), no migration is needed — Vercel boots
// against an empty `app_state` row and fills naturally.

export async function migrateFromJsonToPostgres(): Promise<void> {
  const DATA_DIR = path.resolve(import.meta.dirname || '.', '../../../data');
  const STORE_FILE = path.join(DATA_DIR, '.store.json');

  if (!fs.existsSync(STORE_FILE)) {
    logger.info('[db-setup] No .store.json found — nothing to migrate.');
    return;
  }

  const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Providers
    if (store.providers?.length) {
      for (const p of store.providers) {
        await client.query(
          `INSERT INTO providers (id, type, display_name, api_key, base_url, default_model, enabled, status, last_test_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, p.type, p.displayName, p.apiKey, p.baseUrl, p.defaultModel, p.enabled, p.status, p.lastTestAt, p.createdAt, p.updatedAt]
        );
      }
      logger.info({ count: store.providers.length }, '[db-setup] Migrated providers');
    }

    // Conversations
    if (store.conversations?.length) {
      for (const c of store.conversations) {
        await client.query(
          `INSERT INTO conversations (id, title, language, archived, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [c.id, c.title, c.language, c.archived, c.createdAt, c.updatedAt]
        );
      }
      logger.info({ count: store.conversations.length }, '[db-setup] Migrated conversations');
    }

    // Messages
    if (store.messages?.length) {
      for (const m of store.messages) {
        await client.query(
          `INSERT INTO messages (id, conversation_id, role, content, agent_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [m.id, m.conversationId, m.role, m.content, m.agentId || null, m.createdAt]
        );
      }
      logger.info({ count: store.messages.length }, '[db-setup] Migrated messages');
    }

    // Usage
    if (store.usage?.length) {
      for (const u of store.usage) {
        await client.query(
          `INSERT INTO api_usage (id, timestamp, provider, model, input_tokens, output_tokens, total_cost_usd, duration_ms, success)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [u.id, u.timestamp, u.provider, u.model, u.inputTokens, u.outputTokens, u.totalCostUsd, u.durationMs, u.success]
        );
      }
      logger.info({ count: store.usage.length }, '[db-setup] Migrated usage records');
    }

    // Custom Agents
    if (store.customAgents?.length) {
      for (const a of store.customAgents) {
        await client.query(
          `INSERT INTO custom_agents (id, name_en, name_ar, system_prompt, icon, color, skills, tools, model, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [a.id, a.name.en, a.name.ar, a.systemPrompt, a.icon, a.color, a.skills, a.tools, a.model, a.createdAt, a.updatedAt]
        );
      }
      logger.info({ count: store.customAgents.length }, '[db-setup] Migrated custom agents');
    }

    // Memories
    if (store.memories?.length) {
      for (const m of store.memories) {
        await client.query(
          `INSERT INTO memories (id, agent_id, tier, content, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [m.id, m.agentId, m.tier, m.content, m.createdAt, m.updatedAt]
        );
      }
      logger.info({ count: store.memories.length }, '[db-setup] Migrated memories');
    }

    // Papers
    if (store.papers?.length) {
      for (const p of store.papers) {
        await client.query(
          `INSERT INTO papers (id, filename, title, authors, pages, text_length, sections, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, p.filename, p.title, p.authors, p.pages, p.textLength, JSON.stringify(p.sections), p.createdAt]
        );
      }
      logger.info({ count: store.papers.length }, '[db-setup] Migrated papers');
    }

    // Notes
    if (store.notes?.length) {
      for (const n of store.notes) {
        await client.query(
          `INSERT INTO notes (id, paper_id, section, type, content, themes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [n.id, n.paperId, n.section, n.type, n.content, n.themes, n.createdAt]
        );
      }
      logger.info({ count: store.notes.length }, '[db-setup] Migrated notes');
    }

    // Workflows
    if (store.workflows?.length) {
      for (const w of store.workflows) {
        const nameEn = typeof w.name === 'string' ? w.name : w.name.en;
        const nameAr = typeof w.name === 'string' ? '' : w.name.ar;
        await client.query(
          `INSERT INTO workflows (id, name_en, name_ar, description, steps, trigger_type, trigger_cron, enabled, last_run_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [w.id, nameEn, nameAr, w.description, JSON.stringify(w.steps), w.trigger?.type || 'manual', w.trigger?.cron || null, w.enabled, w.lastRunAt, w.createdAt]
        );
      }
      logger.info({ count: store.workflows.length }, '[db-setup] Migrated workflows');
    }

    // Settings (privacy, budget, notifications)
    if (store.privacyMode) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ('privacyMode', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [JSON.stringify(store.privacyMode)]
      );
    }
    if (store.budget) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ('budget', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [JSON.stringify(store.budget)]
      );
    }
    if (store.notifications) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ('notifications', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [JSON.stringify(store.notifications)]
      );
    }

    await client.query('COMMIT');
    logger.info('[db-setup] Migration from JSON to PostgreSQL complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, '[db-setup] Migration failed');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Utility: get pool for direct queries ───
export function getPool() {
  return pool;
}

// ─── Run standalone ───
// Usage: npx tsx src/db-setup.ts
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  (async () => {
    try {
      await setupDatabase();
      logger.info('[db-setup] Setup complete. Run migrateFromJsonToPostgres() to migrate data.');
    } catch (err) {
      logger.error({ err }, '[db-setup] Failed');
      process.exit(1);
    } finally {
      await pool.end();
    }
  })();
}
