import {
  pgTable,
  uuid,
  varchar,
  integer,
  real,
  boolean,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const apiUsage = pgTable(
  'api_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    agentId: uuid('agent_id'),
    workflowId: uuid('workflow_id'),
    conversationId: uuid('conversation_id'),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    cachedTokens: integer('cached_tokens').default(0).notNull(),
    inputCostUsd: real('input_cost_usd').default(0).notNull(),
    outputCostUsd: real('output_cost_usd').default(0).notNull(),
    totalCostUsd: real('total_cost_usd').default(0).notNull(),
    durationMs: integer('duration_ms').default(0).notNull(),
    success: boolean('success').default(true).notNull(),
    error: text('error'),
  },
  (table) => ({
    timestampIdx: index('api_usage_timestamp_idx').on(table.timestamp),
    agentIdx: index('api_usage_agent_idx').on(table.agentId),
    providerIdx: index('api_usage_provider_idx').on(table.provider),
  })
);
