import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  roles: text('roles').notNull().default('["ST"]'),        // JSON: string[]
  age: integer('age').notNull(),
  overall: real('overall').notNull(),
  tier: text('tier').notNull().default('None'),
  stats: text('stats').notNull().default('{}'),             // JSON: Record<string, number>
  talent: text('talent').notNull().default('Normal'),
  isMutantCandidate: integer('is_mutant_candidate', { mode: 'boolean' }).notNull().default(false),
  snapshot: text('snapshot'),  // JSON: PlayerSnapshot | null — pre-apply state for revert
  createdAt: integer('created_at').notNull(),
});

// Legacy table — kept for historical data; the drill-based model uses drillSessions
export const coaches = sqliteTable('coaches', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  sessionType: text('session_type').notNull().default('Training'),
  multiplier: integer('multiplier').notNull(),
  attributes: text('attributes').notNull().default('[]'),  // JSON: string[]
  source: text('source').notNull().default('Academy'),
  costCurrency: text('cost_currency').notNull().default('free'),
  costAmount: integer('cost_amount').notNull().default(0),
  durationDays: integer('duration_days').notNull().default(1),
  createdAt: integer('created_at').notNull(),
});

export const drillSessions = sqliteTable('drill_sessions', {
  id: text('id').primaryKey(),
  playerId: text('player_id').notNull(),
  drillName: text('drill_name').notNull(),
  sessionCount: integer('session_count').notNull().default(1),
  drillLevel: text('drill_level').notNull().default('Amateur'),   // Amateur|Semi-Pro|Pro|World Class
  talentTier: text('talent_tier').notNull().default('Normal'),    // FT1|FT2|FT3|Normal|Slow
  twoxAd: integer('twox_ad', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});
