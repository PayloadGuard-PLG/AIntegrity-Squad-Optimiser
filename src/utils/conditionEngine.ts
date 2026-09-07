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

/**
 * CHARGED DRAIN IS NOT A DETERMINISTIC FUNCTION OF RAW.
 * ====================================================
 * `raw` is exact. Confirmed at three session sizes against the pre-confirm
 * dialog, surge inactive:
 *
 *   1 drill  Medium                          -> -2.25%
 *   3 drills Easy+Medium+Medium              -> -6.00%
 *   6 drills Easy,Med,Med,Easy,Med,Hard      -> -12.75%
 *
 * The 6-drill case is the tightest: 1.5+2.25+2.25+1.5+2.25+3.0 = 12.75 to the
 * penny, which re-confirms baseLoss 0.75 and the Easy/Medium/Hard multipliers
 * 2/3/4 simultaneously.
 *
 * What is CHARGED is not. The same repeated preset produces a spread:
 *
 *   raw  1.50 (2x Very Easy)  -> charged 1-2   (n=17, mean 1.76)
 *   raw  6.00 (3 drills)      -> charged 5-7   (n=19, mean 6.16)
 *   raw 12.75 (6 drills)      -> charged 10-14 (n=9,  mean 12.56)
 *
 * The means track raw, so raw is the centre of the distribution and not a bound.
 * Two further facts pin the shape:
 *
 *  1. Per-player charge is an INTEGER. Every 1-player row in the history is a
 *     whole percent; only multi-player rows are fractional.
 *  2. The displayed Condition is the MEAN across players. 2 players read -3.50%
 *     (mean of 3 and 4); 38 players read -10.63% (404/38 = 10.6316). That is why
 *     the -10.63% row never fitted any single-player rule - it never was one.
 *
 * MODELS ALREADY FALSIFIED, recorded so they are not re-proposed:
 *  - charge = max(raw, 1):        predicts 1.5/2.25/3.75, never observed.
 *  - charge = max(1, floor(raw)): broken by the -3.50% two-player row and by the
 *                                 5/6/7 spread at a single raw.
 *  - per-drill floor/ceil dither: predicts [11..16] for the 6-drill preset; the
 *                                 history contains a -10.00% row for it.
 *
 * WHAT IS COMMITTED: the dispersion grows with the number of drills, not with
 * raw alone (2 Very Easy drills at raw 1.50 spread as widely as one Easy drill
 * at the same raw). So the envelope is +/-0.5 per drill about raw, rounded
 * outward to integers and clamped at the 1% minimum. That is an OUTER BOUND
 * containing every observation to date, not a fitted distribution - it is
 * deliberately wider than the data so a caller is never told a session is
 * cheaper than it can turn out to be.
 *
 * WHAT WE STILL DO NOT KNOW: whether the spread is genuine randomness or a
 * hidden variable. Candidates are the player's current condition and drill
 * variety, which the game's own training report comments on. Until that is
 * settled the cost is reported as a RANGE and never as a point estimate.
 */

/** Charge dispersion contributed by each drill in the session, in percent. */
const DITHER_PER_DRILL = 0.5;

/** Minimum charged drain. No session has ever been observed to cost 0. */
export interface ChargedRange {
  /** Deterministic mechanical cost - matches the pre-confirm dialog exactly. */
  raw: number;
  /** Centre of the observed charge distribution. Equal to raw. */
  expected: number;
  /** Outer envelope, integer per player, never below the 1% minimum. */
  low: number;
  high: number;
  /** Drills the envelope was widened for. */
  drillCount: number;
  /**
   * 'observed-envelope' - an outer bound containing every observed session
   * (n=45 across three presets). Provisional: the driver of the spread is
   * unidentified, so the width is bounded, not derived.
   */
  confidence: 'observed-envelope';
}

/**
 * Charge distribution for a given raw drain over `drillCount` drills.
 * Returns a range because a point estimate would be a fiction - see above.
 */
export function chargedDrainRange(raw: number, drillCount = 1): ChargedRange {
  if (raw <= 0) {
    return { raw: 0, expected: 0, low: 0, high: 0, drillCount: 0, confidence: 'observed-envelope' };
  }
  const spread = DITHER_PER_DRILL * Math.max(1, drillCount);
  return {
    raw,
    expected: Math.max(MIN_CONDITION_DRAIN_PCT, raw),
    low: Math.max(MIN_CONDITION_DRAIN_PCT, Math.floor(raw - spread)),
    high: Math.max(MIN_CONDITION_DRAIN_PCT, Math.ceil(raw + spread)),
    drillCount,
    confidence: 'observed-envelope',
  };
}

/**
 * Expected charged drain - the CENTRE of the distribution, not a guarantee.
 * Prefer chargedDrainRange wherever the spread matters to the caller.
 */
export function chargedDrain(raw: number, drillCount = 1): number {
  return chargedDrainRange(raw, drillCount).expected;
}

/**
 * EXPECTED condition cost of a single drill. This is the centre of a
 * distribution, not a guaranteed figure - use chargedDrainRange where the
 * spread matters.
 */
export function calculateActualLoss(
  baseLoss: number,
  drillLevel: string = 'Very Easy',
  surge: SurgeState = SURGE_STATE_SEASON_START
): number {
  return chargedDrain(rawDrillDrain(baseLoss, drillLevel, surge), 1);
}

export interface SessionDrain {
  /** Summed mechanical cost before charging. Matches the pre-confirm dialog. */
  raw: number;
  /** Charge distribution for ONE player. */
  charge: ChargedRange;
}

/**
 * Condition cost of running these drills together, for ONE player.
 *
 * The earlier per-drill-vs-per-session floor question is retired: it assumed a
 * deterministic charge, which the history disproves. The open question is what
 * drives the spread, not where a floor is applied.
 */
export function sessionDrain(
  drills: Array<{ baseLoss: number; intensity: string }>,
  surge: SurgeState = SURGE_STATE_SEASON_START
): SessionDrain {
  const raw = drills
    .map(d => rawDrillDrain(d.baseLoss, d.intensity, surge))
    .reduce((a, b) => a + b, 0);
  return { raw, charge: chargedDrainRange(raw, drills.length) };
}
