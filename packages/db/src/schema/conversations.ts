import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }),
  language: varchar('language', { length: 5 }).default('en').notNull(),
  agentId: uuid('agent_id').references(() => agents.id),
  archived: boolean('archived').default(false).notNull(),
  /** CHAT_V2 P1: string IDs of all agents in this conversation (manager + specialists). */
  participantAgentIds: jsonb('participant_agent_ids').$type<string[]>().default([]).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  role: varchar('role', { length: 20 }).notNull(), // system, user, assistant, tool
  content: text('content').notNull(),
  toolCallsJson: jsonb('tool_calls_json').$type<unknown[]>(),
  toolResultsJson: jsonb('tool_results_json').$type<unknown[]>(),
  agentId: uuid('agent_id').references(() => agents.id),
  /** CHAT_V2 P1: bubble kind for WhatsApp-group rendering. */
  kind: varchar('kind', { length: 20 }).default('text').notNull(),
  /** CHAT_V2 P2: link a progress/artifact bubble back to the workflow step that produced it. */
  workflowStepId: uuid('workflow_step_id'),
  /** CHAT_V2 P1: agent-to-agent threading (string ID, not FK — both builtin and custom agents). */
  replyToAgentId: text('reply_to_agent_id'),
  /** CHAT_V2 P1: optional attachments (images, files, audio, video). */
  artifactsJson: jsonb('artifacts_json').$type<Array<{ type: string; url: string; meta?: Record<string, unknown> }>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
