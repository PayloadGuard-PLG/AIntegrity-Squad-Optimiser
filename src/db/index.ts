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
