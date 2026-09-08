import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'; 
import migrations from '../../drizzle/migrations.js'; // explicit .js forces bundler to use generated file, not the stub .ts
import * as schema from './schema';

/**
 * Squad Optimiser - JSI Database Connection
 * Strictly utilizing openDatabaseSync for JSI performance.
 */
export const expoDb = openDatabaseSync('squadoptimiser.db', {
  enableChangeListener: true 
});

export const db = drizzle(expoDb, { schema });

// Add this function to manage the Alntegrity local vault initialization
export const useDbMigration = () => {
  return useMigrations(db, migrations);
};

// Idempotent column guard — catches devices where m0003 was skipped
export function ensureSnapshotColumn() {
  try { expoDb.execSync('ALTER TABLE players ADD COLUMN snapshot text DEFAULT NULL;'); } catch {}
}

// Idempotent column guard — catches devices where m0007 was skipped
export function ensureNewRoleColumns() {
  try { expoDb.execSync('ALTER TABLE players ADD COLUMN new_role text;'); } catch {}
  try { expoDb.execSync('ALTER TABLE players ADD COLUMN new_role_points integer NOT NULL DEFAULT 0;'); } catch {}
}

export function ensureGlyphStateColumns() {
  try { expoDb.execSync('ALTER TABLE players ADD COLUMN playstyle text;'); } catch {}
  try { expoDb.execSync('ALTER TABLE players ADD COLUMN special_abilities text;'); } catch {}
  try { expoDb.execSync('ALTER TABLE players ADD COLUMN boosts text;'); } catch {}
}

/**
 * Idempotent guard for the run-evidence columns on squad_plan_runs.
 *
 * Why a SOURCE column rather than inferring from the values: every row that
 * exists at migration time was written when a coach preview's `+lo-hi` was
 * collapsed to `(lo + hi) / 2` before storage. That midpoint is now
 * indistinguishable BY VALUE from a genuine engine projection — the information
 * was destroyed at the moment of writing. gain_evidence defaults to
 * 'legacy-unknown' so those rows report as unattributable rather than being
 * promoted to projections; only rows written by the current writer carry a real
 * grade. Some correctly-projected rows are demoted with them, knowingly,
 * because nothing distinguishes them.
 *
 * Applied as idempotent ALTERs rather than a drizzle migration, for the reason
 * ensureCoachHistoryTable already records: drizzle-kit regenerates from a
 * snapshot that has drifted from what shipped devices actually hold, and emits
 * a drop-and-recreate of unrelated tables plus a migrations.js that imports
 * .sql files Metro cannot bundle.
 */
export function ensureRunEvidenceColumns() {
  try { expoDb.execSync('ALTER TABLE squad_plan_runs ADD COLUMN ovr_after_lo real;'); } catch {}
  try { expoDb.execSync('ALTER TABLE squad_plan_runs ADD COLUMN ovr_after_hi real;'); } catch {}
  try { expoDb.execSync("ALTER TABLE squad_plan_runs ADD COLUMN gain_evidence TEXT NOT NULL DEFAULT 'legacy-unknown';"); } catch {}
}

export function ensureCoachHistoryTable() {
  try {
    expoDb.execSync(`CREATE TABLE IF NOT EXISTS coach_scan_history (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      coach_type TEXT,
      coach_category TEXT,
      sessions INTEGER,
      stats TEXT NOT NULL DEFAULT '[]',
      transfer_class TEXT NOT NULL DEFAULT 'ordinary',
      preview_intervals TEXT NOT NULL DEFAULT '[]',
      -- Provenance of transfer_class, NOT the class itself. 'observed' means a
      -- scan or an explicit choice set it; anything else means nothing ever
      -- classified this row. See the note on the ALTER below.
      transfer_class_source TEXT NOT NULL DEFAULT 'legacy-default',
      is_manual INTEGER NOT NULL DEFAULT 0,
      label TEXT
    );`);
    // Existing devices already have this table; preserve the transfer class and
    // observed preview intervals when history is replayed through projection.
    try { expoDb.execSync("ALTER TABLE coach_scan_history ADD COLUMN transfer_class TEXT NOT NULL DEFAULT 'ordinary';"); } catch {}
    try { expoDb.execSync("ALTER TABLE coach_scan_history ADD COLUMN preview_intervals TEXT NOT NULL DEFAULT '[]';"); } catch {}
    // Why a SOURCE column and not just a different default on transfer_class:
    // the ALTER above already ran on shipped devices and back-filled every
    // pre-existing row with the literal 'ordinary'. Those rows are now
    // indistinguishable BY VALUE from genuinely-ordinary ones, so the class
    // alone can no longer identify them. This column records where the class
    // came from. It defaults to 'legacy-default', so every row that exists at
    // migration time is marked unclassified and abstains; only rows written by
    // the current writer carry 'observed'.
    try { expoDb.execSync("ALTER TABLE coach_scan_history ADD COLUMN transfer_class_source TEXT NOT NULL DEFAULT 'legacy-default';"); } catch {}
  } catch {}
}

export function ensureDrillPlanHistoryTable() {
  try {
    expoDb.execSync(`CREATE TABLE IF NOT EXISTS drill_plan_history (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      preset_name TEXT NOT NULL,
      drill_names TEXT NOT NULL DEFAULT '[]',
      cycles INTEGER NOT NULL DEFAULT 1,
      fan_level INTEGER NOT NULL DEFAULT 0,
      label TEXT
    );`);
  } catch {}
}
