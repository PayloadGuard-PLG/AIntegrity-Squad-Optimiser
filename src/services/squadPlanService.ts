import { db } from '../db';
import { squadPlanRuns } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid/non-secure';
import { TierName } from '../types/resources';
import {
  StatGain, RunOutcome, EvidenceKind,
  normaliseStatGain, normaliseRunOutcome, runEvidenceKind,
} from '../logic/runEvidence';

export type { StatGain, RunOutcome, EvidenceKind };

export interface SquadPlanRun {
  id: string;
  playerId: string;
  label: string | null;
  sessions: number;
  selectedStats: string[];
  ovrBefore: number;
  /**
   * How this run's figures were arrived at. Read it before reading any of them:
   * a run graded 'observed-interval' has no scalar ovrAfter, and one graded
   * 'legacy-unknown' has a scalar whose origin is unrecoverable.
   */
  outcome: RunOutcome;
  gains: StatGain[];
  tier: TierName | null;
  createdAt: number;
}

export interface SaveRunInput {
  sessions: number;
  selectedStats: string[];
  ovrBefore: number;
  /** Present for a projected run; absent when the run recorded an observation. */
  ovrAfter?: number;
  /**
   * The preview's own displayed OVR BOOST range. Both bounds or neither, never a
   * midpoint, and never added to anything: a boost is what the game showed, and
   * `ovrBefore + boost` is a quantity it did not.
   */
  ovrBoostLo?: number;
  ovrBoostHi?: number;
  gains: StatGain[];
  tier?: TierName | null;
  label?: string | null;
}

type RunRow = typeof squadPlanRuns.$inferSelect;

function fromRow(row: RunRow): SquadPlanRun {
  // Every stored gain goes through normaliseStatGain, which grades a row
  // carrying no `kind` as 'legacy-unknown' rather than 'projected'. Those rows
  // may hold a midpoint laundered out of a game-displayed interval, and nothing
  // on them says which — so they are reported as neither.
  let parsed: unknown[] = [];
  try { parsed = JSON.parse(row.gains) as unknown[]; } catch { parsed = []; }
  const gains = (Array.isArray(parsed) ? parsed : [])
    .map(g => normaliseStatGain(g as Record<string, unknown>));
  return {
    id: row.id,
    playerId: row.playerId,
    label: row.label ?? null,
    sessions: row.sessions,
    selectedStats: JSON.parse(row.selectedStats) as string[],
    ovrBefore: row.ovrBefore,
    outcome: normaliseRunOutcome({
      gainEvidence: row.gainEvidence,
      ovrAfter: row.ovrAfter,
      ovrBoostLo: row.ovrBoostLo,
      ovrBoostHi: row.ovrBoostHi,
    }),
    gains,
    tier: (row.tier as TierName | null) ?? null,
    createdAt: row.createdAt,
  };
}

export const squadPlanService = {
  saveRun(playerId: string, data: SaveRunInput): string {
    const id = nanoid();
    const evidence = runEvidenceKind(data.gains);
    db.insert(squadPlanRuns).values({
      id,
      playerId,
      label: data.label ?? null,
      sessions: data.sessions,
      selectedStats: JSON.stringify(data.selectedStats),
      ovrBefore: data.ovrBefore,
      // ovr_after is NOT NULL on the original table and cannot be dropped in
      // place, so an observed row must still put SOMETHING here. It repeats
      // ovrBefore as an inert filler — deliberately not `ovrBefore + boost`,
      // which would be the laundered post-OVR this design exists to refuse.
      // normaliseRunOutcome returns on the observed branch before reaching this
      // column, so no graded reader can treat the filler as a reading.
      ovrAfter: data.ovrAfter ?? data.ovrBefore,
      // The observed quantity, stored as itself.
      ovrBoostLo: data.ovrBoostLo ?? null,
      ovrBoostHi: data.ovrBoostHi ?? null,
      gainEvidence: evidence,
      gains: JSON.stringify(data.gains),
      tier: data.tier ?? null,
      createdAt: Date.now(),
    }).run();
    return id;
  },

  getRunsForPlayer(playerId: string): SquadPlanRun[] {
    return db.select().from(squadPlanRuns)
      .where(eq(squadPlanRuns.playerId, playerId))
      .orderBy(desc(squadPlanRuns.createdAt))
      .all()
      .map(fromRow);
  },

  getAllRuns(): SquadPlanRun[] {
    return db.select().from(squadPlanRuns)
      .orderBy(desc(squadPlanRuns.createdAt))
      .all()
      .map(fromRow);
  },

  deleteRun(id: string): void {
    db.delete(squadPlanRuns).where(eq(squadPlanRuns.id, id)).run();
  },
};
