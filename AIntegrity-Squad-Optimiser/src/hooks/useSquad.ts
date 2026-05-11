import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../db';
import { players } from '../db/schema';
import { Player } from '../database/playerSchema';
import { TierName, TalentTier } from '../types/resources';

export function useSquad(): { squad: Player[]; error: Error | undefined } {
  const { data: rows = [], error } = useLiveQuery(db.select().from(players));

  const squad: Player[] = rows.map(row => {
    try {
      return {
        id: row.id,
        name: row.name,
        role: JSON.parse(row.roles) as string[],
        age: row.age,
        overall: row.overall,
        tier: row.tier as TierName,
        talent: (row.talent ?? 'Normal') as TalentTier,
        stats: JSON.parse(row.stats) as Record<string, number>,
        isMutantCandidate: Boolean(row.isMutantCandidate),
      };
    } catch {
      return {
        id: row.id,
        name: row.name,
        role: ['ST'],
        age: row.age,
        overall: row.overall,
        tier: row.tier as TierName,
        talent: 'Normal' as TalentTier,
        stats: {},
        isMutantCandidate: false,
      };
    }
  });

  return { squad, error };
}
