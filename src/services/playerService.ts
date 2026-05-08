import { db } from '../db';
import { players } from '../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid/non-secure';
import { Player } from '../database/playerSchema';
import { TierName, TalentTier } from '../types/resources';

type PlayerRow = typeof players.$inferSelect;

function toRow(p: Player): PlayerRow {
  return {
    id: p.id || nanoid(),
    name: p.name,
    roles: JSON.stringify(p.role),
    age: p.age,
    overall: p.overall,
    tier: p.tier,
    talent: p.talent ?? 'Normal',
    stats: JSON.stringify(p.stats),
    isMutantCandidate: p.isMutantCandidate,
    createdAt: Date.now(),
  };
}

function fromRow(row: PlayerRow): Player {
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
      talent: 'Normal',
      stats: {},
      isMutantCandidate: false,
    };
  }
}

export const playerService = {
  getAll(): Player[] {
    return db.select().from(players).all().map(fromRow);
  },

  getById(id: string): Player | null {
    const row = db.select().from(players).where(eq(players.id, id)).get();
    return row ? fromRow(row) : null;
  },

  create(p: Omit<Player, 'id'>): string {
    const row = toRow({ ...p, id: nanoid() });
    db.insert(players).values(row).run();
    return row.id;
  },

  update(p: Player): void {
    const { id, ...rest } = toRow(p);
    db.update(players).set(rest).where(eq(players.id, id)).run();
  },

  delete(id: string): void {
    db.delete(players).where(eq(players.id, id)).run();
  },
};
