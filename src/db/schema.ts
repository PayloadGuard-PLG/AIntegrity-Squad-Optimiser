import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  roles: text('roles').notNull().default('["ST"]'),        // JSON: string[]
  age: integer('age').notNull(),
  overall: real('overall').notNull(),
  tier: text('tier').notNull().default('T0'),
  stats: text('stats').notNull().default('{}'),             // JSON: Record<string, number>
  talent: text('talent').notNull().default('Normal'),
  isMutantCandidate: integer('is_mutant_candidate', { mode: 'boolean' }).notNull().default(false),
  snapshot: text('snapshot'),  // JSON: PlayerSnapshot | null — pre-apply state for revert
  newRole: text('new_role'),                                       // role currently being trained (e.g. "DMC")
  newRolePoints: integer('new_role_points').notNull().default(0), // training progress 0–50; unlocks at 50
  playstyle: text('playstyle'),                                    // PlaystyleFamily | null (null = never read)
  specialAbilities: text('special_abilities'),                     // JSON: string[] | null
  boosts: text('boosts'),                                          // JSON: Record<string, StatBoost> | null
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

export const squadPlanRuns = sqliteTable('squad_plan_runs', {
  id: text('id').primaryKey(),
  playerId: text('player_id').notNull(),
  label: text('label'),
  sessions: integer('sessions').notNull(),
  selectedStats: text('selected_stats').notNull(),  // JSON: string[]
  ovrBefore: real('ovr_before').notNull(),
  ovrAfter: real('ovr_after').notNull(),
  // The coach preview's OWN displayed OVR BOOST range, when it showed one.
  //
  // Not a post-action OVR: the game displays a boost, never a resulting OVR, so
  // storing `ovrBefore + boost` would launder an observation into a different
  // quantity nobody ever saw. Both bounds, no midpoint, no addition.
  ovrBoostLo: real('ovr_boost_lo'),
  ovrBoostHi: real('ovr_boost_hi'),
  // Provenance of the figures above and of every entry in `gains`, NOT the
  // figures themselves. Defaults to 'legacy-unknown' so rows that predate the
  // distinction are never read as engine projections. See runEvidence.ts.
  gainEvidence: text('gain_evidence').notNull().default('legacy-unknown'),
  gains: text('gains').notNull(),                   // JSON: StatGain[]
  tier: text('tier'),
  createdAt: integer('created_at').notNull(),
});

export const drillPresets = sqliteTable('drill_presets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  drillNames: text('drill_names').notNull(),  // JSON: string[] up to 6
  createdAt: integer('created_at').notNull(),
});

export const drillSessions = sqliteTable('drill_sessions', {
  id: text('id').primaryKey(),
  playerId: text('player_id').notNull(),
  drillName: text('drill_name').notNull(),
  sessionCount: integer('session_count').notNull().default(1),
  drillLevel: text('drill_level').notNull().default('Very Easy'),  // unused — reserved for future session logging
  talentTier: text('talent_tier').notNull().default('Normal'),    // Fastest|Fast|Average|Normal|Slow
  twoxAd: integer('twox_ad', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});
