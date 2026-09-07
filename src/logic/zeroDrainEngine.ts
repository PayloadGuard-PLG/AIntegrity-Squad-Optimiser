import { DRILL_BASE_COSTS } from '../utils/modifiers';
import { rawDrillDrain, chargedDrain, MIN_CONDITION_DRAIN_PCT } from '../utils/conditionEngine';
import gameProfileJson from '../../profiles/game_2025.json';
import { GameProfile, SurgeState, SURGE_STATE_SEASON_START } from '../types/resources';

const profile = gameProfileJson as unknown as GameProfile;

/**
 * Sub-floor bundle finder (replaces the old Zero-Drain Engine).
 *
 * There are no zero-drain drills any more — the game patched that loophole and
 * charges a 1% minimum instead. The surviving optimisation is different: because
 * the floor is a MINIMUM per charge, several cheap drills whose RAW total still
 * sits under the floor can share one charge.
 *
 * IMPORTANT: this only pays if the floor applies to the session total rather than
 * per drill, which is NOT yet established from game observation. Callers get the
 * bundle plus both cost readings and must present it as conditional until a
 * multi-drill session settles the rule. See conditionEngine.sessionDrain.
 */
export interface SubFloorBundle {
  intensities: Array<keyof typeof DRILL_BASE_COSTS>;
  rawTotal: number;
  /** Cost if the floor applies once to the session. */
  chargedPerSession: number;
  /** Cost if the floor applies to each drill. */
  chargedPerDrill: number;
}

const INTENSITY_NAME: Record<keyof typeof DRILL_BASE_COSTS, string> = {
  VERY_EASY: 'Very Easy', EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard', VERY_HARD: 'Very Hard',
};

/**
 * Largest set of drills (up to `maxDrills`) whose raw total stays under the floor.
 * Returns null when no combination does — which is the case at every Perfect
 * Conditions state except active at level 4.
 */
export function findSubFloorBundle(
  surge: SurgeState = SURGE_STATE_SEASON_START,
  maxDrills = 6
): SubFloorBundle | null {
  const cheapest = (Object.keys(DRILL_BASE_COSTS) as Array<keyof typeof DRILL_BASE_COSTS>)
    .map(k => ({ k, raw: rawDrillDrain(profile.baseLossPerDrill, INTENSITY_NAME[k], surge) }))
    .sort((a, b) => a.raw - b.raw)[0];
  if (!cheapest) return null;

  let n = 0;
  while (n + 1 <= maxDrills && (n + 1) * cheapest.raw < MIN_CONDITION_DRAIN_PCT) n++;
  if (n < 2) return null; // one drill is not a bundle; it always costs the floor

  const intensities = Array<keyof typeof DRILL_BASE_COSTS>(n).fill(cheapest.k);
  const rawTotal = n * cheapest.raw;
  return {
    intensities,
    rawTotal,
    chargedPerSession: chargedDrain(rawTotal),
    chargedPerDrill: n * chargedDrain(cheapest.raw),
  };
}
