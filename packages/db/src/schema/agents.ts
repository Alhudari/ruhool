import { pgTable, uuid, varchar, jsonb, timestamp, text } from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: varchar('module_id', { length: 100 }).notNull().unique(),
  name: jsonb('name').notNull().$type<{ en: string; ar: string }>(),
  description: jsonb('description').$type<{ en: string; ar: string }>(),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 50 }),
  systemPrompt: text('system_prompt'),
  configJson: jsonb('config_json').$type<Record<string, unknown>>().default({}),
  preferredProvider: varchar('preferred_provider', { length: 50 }),
  preferredModel: varchar('preferred_model', { length: 100 }),
  skills: jsonb('skills').$type<string[]>().default([]),
  tools: jsonb('tools').$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
