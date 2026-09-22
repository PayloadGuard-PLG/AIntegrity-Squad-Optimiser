import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../db';
import { players } from '../db/schema';
import { Player } from '../database/playerSchema';
import { hydrateStoredPlayer } from '../logic/playerHydration';

export function useSquad(): { squad: Player[]; error: Error | undefined } {
  const { data: rows = [], error } = useLiveQuery(db.select().from(players));
  return { squad: rows.map(hydrateStoredPlayer), error };
}
