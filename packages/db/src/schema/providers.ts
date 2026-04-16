import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const providers = pgTable('providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 50 }).notNull(), // anthropic, openai, google-gemini, ollama
  displayName: varchar('display_name', { length: 100 }).notNull(),
  encryptedApiKey: text('encrypted_api_key'),
  baseUrl: varchar('base_url', { length: 500 }),
  defaultModel: varchar('default_model', { length: 100 }),
  enabled: boolean('enabled').default(true).notNull(),
  status: varchar('status', { length: 20 }).default('untested').notNull(), // untested, ok, failing
  lastTestAt: timestamp('last_test_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
