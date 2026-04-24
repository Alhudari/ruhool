import { pgTable, uuid, integer, jsonb, text, timestamp, decimal } from 'drizzle-orm/pg-core';
import { readingSessions } from './reading-sessions.js';

export type HighlightColor = 'yellow' | 'green' | 'red' | 'blue' | 'purple' | 'orange';

export interface PageHighlight {
  text: string;
  color: HighlightColor;
  reason: string;
}

export interface LibraryLink {
  exists: boolean;
  paper?: string;
  note?: string;
}

export const pageAnalyses = pgTable('page_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .references(() => readingSessions.id)
    .notNull(),
  pageNumber: integer('page_number').notNull(),
  version: integer('version').default(1).notNull(),
  // Client tracks the lineage of regenerations; no self-FK to keep inserts simple.
  parentVersionId: uuid('parent_version_id'),
  mainIdea: text('main_idea'),
  tableData: text('table_data'),
  libraryLink: jsonb('library_link').$type<LibraryLink>(),
  phdRelevance: text('phd_relevance'),
  tags: jsonb('tags').$type<string[]>(),
  highlights: jsonb('highlights').$type<PageHighlight[]>(),
  question: text('question'),
  refinementRequest: text('refinement_request'),
  modelUsed: text('model_used'),
  tokenCost: decimal('token_cost', { precision: 10, scale: 6 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type PageAnalysis = typeof pageAnalyses.$inferSelect;
export type NewPageAnalysis = typeof pageAnalyses.$inferInsert;
