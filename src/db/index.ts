import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'; 
import migrations from '../../drizzle/migrations'; 
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
