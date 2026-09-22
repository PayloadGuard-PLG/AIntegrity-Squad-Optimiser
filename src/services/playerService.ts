import { db } from '../db';
import { players } from '../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid/non-secure';
import { Player, PlayerSnapshot } from '../database/playerSchema';
import { TierName } from '../types/resources';
import { normaliseStoredTrainingRate, normaliseTrainingRateSource } from '../logic/trainingRate';
import { hydrateStoredPlayer } from '../logic/playerHydration';

type PlayerRow = typeof players.$inferSelect;

function toRow(p: Player): PlayerRow {
  return {
    id: p.id || nanoid(),
    name: p.name,
    roles: JSON.stringify(p.role),
    age: p.age,
    overall: p.overall,
    tier: p.tier,
    talent: normaliseStoredTrainingRate(p.talent),
    talentSource: normaliseTrainingRateSource(p.talentSource),
    stats: JSON.stringify(p.stats),
    isMutantCandidate: p.isMutantCandidate,
    snapshot: p.snapshot ? JSON.stringify(p.snapshot) : null,
    newRole: p.newRole ?? null,
    newRolePoints: p.newRolePoints ?? 0,
    playstyle: p.playstyle ?? null,
    specialAbilities: p.specialAbilities ? JSON.stringify(p.specialAbilities) : null,
    // Boosts persist ALONGSIDE stats; stats stays base. Never collapse the two.
    boosts: p.boosts ? JSON.stringify(p.boosts) : null,
    createdAt: Date.now(),
  };
}

function fromRow(row: PlayerRow): Player {
  return hydrateStoredPlayer(row);
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

  // Saves current stats/overall/tier as a snapshot, then applies new values.
  // Replaces any existing snapshot (only one level of undo).
  applyAndSnapshot(player: Player, updates: { stats: Record<string, number>; overall: number; tier: TierName }): void {
    const snap: PlayerSnapshot = { stats: player.stats, overall: player.overall, tier: player.tier };
    const updated: Player = { ...player, ...updates, snapshot: snap };
    const { id, ...rest } = toRow(updated);
    db.update(players).set(rest).where(eq(players.id, id)).run();
  },

  // Restores the player to the saved snapshot and clears it.
  revertToSnapshot(id: string): void {
    const player = playerService.getById(id);
    if (!player?.snapshot) return;
    const { stats, overall, tier } = player.snapshot;
    const reverted: Player = { ...player, stats, overall, tier, snapshot: null };
    const { id: pid, ...rest } = toRow(reverted);
    db.update(players).set(rest).where(eq(players.id, pid)).run();
  },

  delete(id: string): void {
    db.delete(players).where(eq(players.id, id)).run();
  },
};
