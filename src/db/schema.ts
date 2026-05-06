import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  age: integer('age').notNull(),
  baseOvr: real('base_ovr').notNull(),
  tier: text('tier').notNull().default('None'), // Maps to TIER_DATA [cite: 28, 289]
  isAcademy: integer('is_academy', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});
