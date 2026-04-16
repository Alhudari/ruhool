import { pgTable, uuid, text, integer, timestamp, real, jsonb } from 'drizzle-orm/pg-core';

export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  createdByConversationId: uuid('created_by_conversation_id'),
  status: text('status', {
    enum: ['pending', 'running', 'paused', 'completed', 'failed', 'canceled'],
  })
    .default('pending')
    .notNull(),
  currentStepIndex: integer('current_step_index').default(0).notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  error: text('error'),
  totalCostUsd: real('total_cost_usd').default(0).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
