import gameProfileJson from '../../profiles/game_2025.json';
import { GameProfile, SurgeState, SURGE_STATE_SEASON_START } from '../types/resources';

const profile = gameProfileJson as unknown as GameProfile;

// Condition drain multipliers per drill difficulty — loaded from profile.
// These are SEPARATE from profile.drillLevelMultipliers (which scale XP gain only).
export const COND_LEVEL_MULTIPLIERS: Record<string, number> = profile.condLevelMultipliers;

/**
 * Perfect Conditions surge reductions, indexed by surge level 0-4.
 * FRACTIONS of 1 (0.1 = -10%), exactly as the in-game surge panel states them.
 */
const SURGE_REDUCTION: number[] = profile.fanClubCondReduction;

/** Minimum condition % any session is charged, however small the raw drain. */
export const MIN_CONDITION_DRAIN_PCT: number = profile.minimumConditionDrainPct;

/**
 * CONDITION MODEL v2 — raw vs charged
 * ===================================
 * The game patched the old 0% drain loophole. Sub-threshold drills are no longer
 * free; they are charged a flat 1% minimum. Two quantities must stay separate:
 *
 *   RAW     — what the drill mechanically costs before the floor. Preserved so a
 *             combination optimiser can be calibrated later without inventing an
 *             aggregation rule.
 *   CHARGED — what the game actually deducts: max(raw, 1.00), never zero.
 *
 * Confirmed empirically (training history, surge inactive): a single Very Easy
 * drill has raw drain 0.750% and is charged -1.00%.
 *
 * DELIBERATELY UNSPECIFIED: whether the floor applies per drill or to the summed
 * session. `sessionDrain` exposes both readings rather than guessing — see
 * SessionDrain.floorRule.
 */

/** Fraction of drain removed. Zero unless the surge is actually active. */
export function conditionReduction(surge: SurgeState = SURGE_STATE_SEASON_START): number {
  if (!surge.perfectConditionsActive) return 0;
  return SURGE_REDUCTION[surge.perfectConditionsLevel] ?? 0;
}

/**
 * Raw (pre-floor) condition cost of one drill.
 * baseLoss × intensity multiplier × (1 − surge reduction).
 */
export function rawDrillDrain(
  baseLoss: number,
  drillLevel: string = 'Very Easy',
  surge: SurgeState = SURGE_STATE_SEASON_START
): number {
  const diffMult = COND_LEVEL_MULTIPLIERS[drillLevel] ?? 1;
  return baseLoss * diffMult * (1 - conditionReduction(surge));
}

/** Apply the minimum-charge floor. Zero raw (no drills) stays zero. */
export function chargedDrain(raw: number): number {
  if (raw <= 0) return 0;
  return Math.max(raw, MIN_CONDITION_DRAIN_PCT);
}

export interface SessionDrain {
  /** Summed mechanical cost before any floor. */
  raw: number;
  /** Floor applied once to the session total. */
  chargedPerSession: number;
  /** Floor applied to each drill, then summed. */
  chargedPerDrill: number;
  /**
   * Which reading to trust is NOT yet established from game observation. Where
   * the two agree this is 'settled'; where they differ the caller must treat the
   * cost as a range, not a number.
   */
  floorRule: 'settled' | 'ambiguous';
}

/** Condition cost of running these drills together in one session. */
export function sessionDrain(
  drills: Array<{ baseLoss: number; intensity: string }>,
  surge: SurgeState = SURGE_STATE_SEASON_START
): SessionDrain {
  const raws = drills.map(d => rawDrillDrain(d.baseLoss, d.intensity, surge));
  const raw = raws.reduce((a, b) => a + b, 0);
  const chargedPerSession = chargedDrain(raw);
  const chargedPerDrill = raws.reduce((sum, r) => sum + chargedDrain(r), 0);
  return {
    raw,
    chargedPerSession,
    chargedPerDrill,
    floorRule: Math.abs(chargedPerSession - chargedPerDrill) < 1e-9 ? 'settled' : 'ambiguous',
  };
}

/**
 * Condition cost of a single drill — the only case where the two floor readings
 * cannot disagree, so it is safe to return a scalar.
 */
export function calculateActualLoss(
  baseLoss: number,
  drillLevel: string = 'Very Easy',
  surge: SurgeState = SURGE_STATE_SEASON_START
): number {
  return chargedDrain(rawDrillDrain(baseLoss, drillLevel, surge));
}
