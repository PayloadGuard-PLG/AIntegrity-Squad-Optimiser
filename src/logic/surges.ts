import gameProfileJson from '../../profiles/game_2025.json';
import {
  GameProfile, SurgeId, SurgeLevel, SurgeBoard, SurgeDefinition,
  SURGE_IDS, SURGE_BOARD_SEASON_START,
} from '../types/resources';

const profile = gameProfileJson as unknown as GameProfile;

/**
 * Fan Club surge registry — the single place the six surges and their level
 * tables are read from. Values are recorded in profiles/game_2025.json exactly as
 * the in-game surge panels state them; nothing here is inferred.
 *
 * Observed 2026-09-07, loyalty 10379 at 155/h:
 *   ACTIVE   respectableAttendance, teamplayPower
 *   INACTIVE perfectConditions, packedAttendance, buzzingAttendance, roleAccelerator
 *
 * Only `perfectConditions` is consumed by the engine today (condition drain).
 * `roleAccelerator` is the next one that matters here — it scales the rate at
 * which players.new_role_points accrues, which the app already models — but the
 * accrual rate itself has never been calibrated, so it stays `modelled: false`
 * rather than being wired to a guess.
 */
export const SURGES: Record<SurgeId, SurgeDefinition> =
  ((profile.surges ?? {}) as unknown as Record<SurgeId, SurgeDefinition>);

export function surgeDefinition(id: SurgeId): SurgeDefinition | undefined {
  return SURGES[id];
}

/**
 * The value a surge grants at a given level, in the units its definition
 * declares. Returns undefined when the surge is unknown — never a zero that
 * could be mistaken for "no benefit".
 */
export function surgeValueAtLevel(id: SurgeId, level: SurgeLevel): number | undefined {
  return SURGES[id]?.levels[level];
}

/**
 * The value a surge is ACTUALLY granting right now. Zero while inactive: a
 * banked level confers nothing until loyalty crosses the surge's threshold.
 */
export function activeSurgeValue(board: SurgeBoard, id: SurgeId): number {
  const status = board[id];
  if (!status?.active) return 0;
  return surgeValueAtLevel(id, status.level) ?? 0;
}

/** Surges the engine currently consumes. */
export function modelledSurges(): SurgeId[] {
  return SURGE_IDS.filter(id => SURGES[id]?.modelled);
}

/**
 * Surges that are observed and understood but not yet wired into any
 * calculation. Listed so the gap is visible rather than silently absent.
 */
export function unmodelledSurges(): SurgeId[] {
  return SURGE_IDS.filter(id => SURGES[id] && !SURGES[id].modelled);
}

/** Convenience: a board with every surge off, i.e. season start. */
export function seasonStartBoard(): SurgeBoard {
  return { ...SURGE_BOARD_SEASON_START };
}

/**
 * Build a board from a partial observation. Anything not observed stays OFF at
 * level 0 rather than being assumed active — the same abstention rule used
 * everywhere else in this codebase.
 */
export function boardFrom(observed: Partial<Record<SurgeId, { active: boolean; level: SurgeLevel }>>): SurgeBoard {
  const board = seasonStartBoard();
  for (const id of SURGE_IDS) {
    const o = observed[id];
    if (o) board[id] = { active: o.active, level: o.level };
  }
  return board;
}
