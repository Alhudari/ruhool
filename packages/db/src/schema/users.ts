import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }),
  languagePref: varchar('language_pref', { length: 5 }).default('en').notNull(),
  themePref: varchar('theme_pref', { length: 50 }).default('claude-clean').notNull(),
  themeVariant: varchar('theme_variant', { length: 10 }).default('system').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
