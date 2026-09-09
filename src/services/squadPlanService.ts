import { db } from '../db';
import { squadPlanRuns } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid/non-secure';
import { TierName } from '../types/resources';
import {
  StatGain, RunOutcome, EvidenceKind, ProjectedStatGain, ObservedStatGain,
  normaliseStatGain, normaliseRunOutcome,
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

/** Fields every newly-written run carries, whatever its provenance. */
interface SaveRunCommon {
  sessions: number;
  selectedStats: string[];
  ovrBefore: number;
  tier?: TierName | null;
  label?: string | null;
}

/**
 * The write contract, discriminated by provenance.
 *
 * The grade is no longer INFERRED from the gains after the caller has crossed
 * this boundary — it is declared, and declaring it constrains the gain type and
 * the quality fields simultaneously. Previously `gains: StatGain[]` sat beside
 * optional `ovrAfter` and `ovrBoostLo/Hi` in one object and saveRun read the
 * grade back off the array, so a caller could pass observed gains with a
 * computed `ovrAfter`, or mix kinds in one array, and the type system had no
 * opinion. The two live callers happened to behave; the shapes were still
 * representable, and a representable wrong state is a defect waiting for a
 * third caller.
 *
 * `legacy-unknown` is deliberately absent. It is a READ state — what a row
 * written before the grades existed reports itself as — and nothing may newly
 * assume it.
 */
export type SaveRunInput =
  | (SaveRunCommon & {
      kind: 'projected';
      /** Engine output: one number per stat, because the model produced one. */
      gains: ProjectedStatGain[];
      /** The model computed a whole resulting stat set, so a post-OVR exists. */
      ovrAfter: number;
      /** A projection observed nothing. There is no API here to claim it did. */
      ovrBoostLo?: never;
      ovrBoostHi?: never;
    })
  | (SaveRunCommon & {
      kind: 'observed-interval';
      /** Game-displayed +lo-hi, both bounds, no midpoint. */
      gains: ObservedStatGain[];
      /**
       * No post-action OVR exists to supply. The preview displays a boost and
       * never a result, so an observed caller has no API by which to provide
       * one — and the NOT NULL compatibility filler is derived inside saveRun,
       * where a caller cannot reach it.
       */
      ovrAfter?: never;
    } & (
      // Both bounds or neither: half an interval is not an interval, and the
      // pairing is enforced here rather than left to a runtime check.
      | { ovrBoostLo: number; ovrBoostHi: number }
      | { ovrBoostLo?: never; ovrBoostHi?: never }
    ));

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
    // The grade comes from the caller's declared kind, never from inspecting
    // the gains. Inferring it here would let the array and the quality fields
    // disagree, which is the state the discriminated input exists to forbid.
    const gainEvidence: EvidenceKind = data.kind;

    // ovr_after is NOT NULL on the original table and cannot be dropped in
    // place, so an observed row must still put SOMETHING in it. That filler is
    // MANUFACTURED HERE, inside the persistence layer, and is not a value any
    // caller can supply: it repeats ovrBefore, deliberately not
    // `ovrBefore + boost`, which would be the laundered post-OVR this design
    // refuses. normaliseRunOutcome returns on the observed branch before this
    // column can be reached, so no graded reader can mistake it for a reading.
    const ovrAfter = data.kind === 'projected' ? data.ovrAfter : data.ovrBefore;

    db.insert(squadPlanRuns).values({
      id,
      playerId,
      label: data.label ?? null,
      sessions: data.sessions,
      selectedStats: JSON.stringify(data.selectedStats),
      ovrBefore: data.ovrBefore,
      ovrAfter,
      ovrBoostLo: data.kind === 'observed-interval' ? data.ovrBoostLo ?? null : null,
      ovrBoostHi: data.kind === 'observed-interval' ? data.ovrBoostHi ?? null : null,
      gainEvidence,
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
