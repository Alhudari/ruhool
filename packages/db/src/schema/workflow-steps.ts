import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { workflowRuns } from './workflow-runs';

export const workflowSteps = pgTable('workflow_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id')
    .notNull()
    .references(() => workflowRuns.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  specialist: text('specialist').notNull(),
  task: text('task').notNull(),
  expectedOutput: text('expected_output'),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
  })
    .default('pending')
    .notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  input: jsonb('input').$type<Record<string, unknown>>(),
  output: text('output'),
  artifacts: jsonb('artifacts').$type<
    Array<{
      type: 'image' | 'video' | 'audio' | 'file';
      url: string;
      meta?: Record<string, unknown>;
    }>
  >(),
  usage: jsonb('usage').$type<{
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    model: string;
  }>(),
  durationMs: integer('duration_ms'),
  // G7: per-step execution timeout (ms). Default is 1h to match the
  // Temporal activity startToCloseTimeout.
  timeoutMs: integer('timeout_ms').default(3600000),
  // G8: attempt counter surfaces retry pressure to the dashboard.
  attemptCount: integer('attempt_count').default(0),
  maxAttempts: integer('max_attempts').default(3),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
