import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { conversations } from './conversations';

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    tier: varchar('tier', { length: 20 }).notNull(), // working, short-term, long-term
    content: text('content').notNull(),
    // pgvector embedding stored as text for now, proper vector type added when extension is enabled
    embedding: text('embedding'),
    sourceConversationId: uuid('source_conversation_id').references(
      () => conversations.id
    ),
    confidence: real('confidence').default(1.0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastAccessedAt: timestamp('last_accessed_at').defaultNow().notNull(),
  },
  (table) => ({
    agentTierIdx: index('memories_agent_tier_idx').on(
      table.agentId,
      table.tier
    ),
  })
);
