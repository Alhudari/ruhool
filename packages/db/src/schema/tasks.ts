import { pgTable, uuid, varchar, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('queued').notNull(),
  progress: integer('progress').default(0).notNull(),
  progressMessage: varchar('progress_message', { length: 500 }),
  inputJson: jsonb('input_json').$type<Record<string, unknown>>().default({}),
  outputJson: jsonb('output_json').$type<Record<string, unknown>>(),
  agentId: uuid('agent_id').references(() => agents.id),
  workflowId: uuid('workflow_id'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
