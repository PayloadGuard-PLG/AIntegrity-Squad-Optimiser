import { DRILL_BASE_COSTS } from '../utils/modifiers';
import { rawDrillDrain, chargedDrain, MIN_CONDITION_DRAIN_PCT } from '../utils/conditionEngine';
import gameProfileJson from '../../profiles/game_2025.json';
import { GameProfile, SurgeState, SURGE_STATE_SEASON_START } from '../types/resources';

const profile = gameProfileJson as unknown as GameProfile;

/**
 * Sub-floor bundle finder (replaces the old Zero-Drain Engine).
 *
 * There are no zero-drain drills any more — the game patched that loophole and
 * charges a 1% minimum instead.
 *
 * THIS CURRENTLY ABSTAINS, DELIBERATELY. The bundling idea assumed the charge is
 * a deterministic function of raw drain, so that packing several drills under one
 * threshold would buy a single cheap charge. The training history disproves that
 * premise: the same 3-drill preset (raw 6.00) was charged 5%, 6% and 7% across 19
 * runs. Until the driver of that spread is identified, any bundle recommendation
 * would be advice built on a model we know to be incomplete.
 *
 * findSubFloorBundle therefore returns null in every state and records why, rather
 * than returning a plausible-looking bundle. See conditionEngine for the evidence.
 */
export interface SubFloorBundle {
  intensities: Array<keyof typeof DRILL_BASE_COSTS>;
  rawTotal: number;
  chargedPerSession: number;
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
export function bundlingStatus(): { available: false; reason: string } {
  return {
    available: false,
    reason:
      'Charged condition is not a deterministic function of raw drain — the same ' +
      '3-drill preset (raw 6.00) was charged 5-7% across 19 observed runs. ' +
      'Bundling advice is withheld until the driver of that spread is identified.',
  };
}

export function findSubFloorBundle(
  _surge: SurgeState = SURGE_STATE_SEASON_START,
  _maxDrills = 6
): SubFloorBundle | null {
  return null; // see bundlingStatus()
}

function findSubFloorBundleUnused(
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
