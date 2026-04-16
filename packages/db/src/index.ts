import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export * from './schema/index.js';
export { schema };

let db: ReturnType<typeof createDb> | null = null;

/**
 * Create a Drizzle DB instance.
 *
 * Works with any PostgreSQL provider — Supabase, Neon, Railway, local.
 * Just set DATABASE_URL. Cloud providers need ssl=true in the URL or
 * DB_SSL=true env var.
 */
function createDb(connectionString: string) {
  const isCloud = connectionString.includes('supabase.co')
    || connectionString.includes('neon.tech')
    || connectionString.includes('railway.app')
    || process.env.DB_SSL === 'true';

  const client = postgres(connectionString, {
    // Cloud DBs need SSL; local doesn't
    ssl: isCloud ? 'require' : false,
    // Connection pool — serverless-friendly defaults
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || '20', 10),
    connect_timeout: 10,
    // Prepare statements disabled for pooled connections (Supabase pgBouncer)
    prepare: process.env.DB_DISABLE_PREPARE === 'true' ? false : true,
  });

  return drizzle(client, { schema });
}

export function getDb(connectionString?: string) {
  if (!db) {
    const url = connectionString || process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is required — set it to any PostgreSQL provider (Supabase, Neon, Railway, or local)');
    }
    db = createDb(url);
  }
  return db;
}

/** Close the connection pool. Useful for graceful shutdown. */
export async function closeDb(): Promise<void> {
  db = null;
}

export type Database = ReturnType<typeof createDb>;
