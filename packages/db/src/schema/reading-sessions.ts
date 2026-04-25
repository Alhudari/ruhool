import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, decimal } from 'drizzle-orm/pg-core';

export const readingSessions = pgTable('reading_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id'),
  paperId: text('paper_id').notNull(),
  paperTitle: text('paper_title').notNull(),
  paperMeta: jsonb('paper_meta').$type<{
    authors?: string;
    year?: number;
    journal?: string;
    doi?: string;
  }>(),
  source: varchar('source', { length: 20 }).notNull(),
  language: varchar('language', { length: 2 }).default('en'),
  mindOverride: text('mind_override'),
  totalPages: integer('total_pages').default(0).notNull(),
  currentPage: integer('current_page').default(0).notNull(),
  status: varchar('status', { length: 20 }).default('active'),
  totalCost: decimal('total_cost', { precision: 10, scale: 4 }).default('0'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export type ReadingSession = typeof readingSessions.$inferSelect;
export type NewReadingSession = typeof readingSessions.$inferInsert;
