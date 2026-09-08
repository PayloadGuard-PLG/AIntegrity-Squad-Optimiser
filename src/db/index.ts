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
      is_manual INTEGER NOT NULL DEFAULT 0,
      label TEXT
    );`);
    // Existing devices already have this table; preserve the transfer class and
    // observed preview intervals when history is replayed through projection.
    try { expoDb.execSync("ALTER TABLE coach_scan_history ADD COLUMN transfer_class TEXT NOT NULL DEFAULT 'ordinary';"); } catch {}
    try { expoDb.execSync("ALTER TABLE coach_scan_history ADD COLUMN preview_intervals TEXT NOT NULL DEFAULT '[]';"); } catch {}
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
