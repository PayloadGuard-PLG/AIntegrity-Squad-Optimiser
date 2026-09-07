import gameProfileJson from '../../profiles/game_2025.json';
import { GameProfile, SurgeState, SURGE_STATE_SEASON_START } from '../types/resources';
import { rawDrillDrain, chargedDrain } from './conditionEngine';

const profile = gameProfileJson as unknown as GameProfile;

/**
 * Perfect Conditions surge RETENTION per level (1 − reduction).
 * Was named FAN_CLUB_LEVELS; the mechanic is a surge, not a fan club level.
 */
export const SURGE_RETENTION = {
  LEVEL_0: 0.90, LEVEL_1: 0.85, LEVEL_2: 0.80, LEVEL_3: 0.75, LEVEL_4: 0.50,
};
/** @deprecated misleading name — kept so existing imports resolve. */
export const FAN_CLUB_LEVELS = SURGE_RETENTION;

export const DRILL_BASE_COSTS = {
  VERY_EASY: 0.75, EASY: 1.50, MEDIUM: 2.25, HARD: 3.00, VERY_HARD: 3.75,
};

const INTENSITY_NAME: Record<keyof typeof DRILL_BASE_COSTS, string> = {
  VERY_EASY: 'Very Easy', EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard', VERY_HARD: 'Very Hard',
};

/**
 * Charged condition cost of one drill.
 *
 * CHANGED: chants do NOT reduce condition directly. The previous model applied
 * `1 − min(chants,5) × 0.03`, which does not exist in game. A chant upgrades ONE
 * randomly chosen surge by one level; its effect on condition is entirely via the
 * Perfect Conditions surge level, and only while that surge is active. Pass the
 * observed SurgeState instead of a chant count.
 *
 * Also: no result is ever 0. The 0% drain loophole was patched — sub-floor drills
 * are charged profile.minimumConditionDrainPct.
 */
export function calculateDrillConditionCost(
  drillIntensity: keyof typeof DRILL_BASE_COSTS,
  surge: SurgeState = SURGE_STATE_SEASON_START
): number {
  const raw = rawDrillDrain(profile.baseLossPerDrill, INTENSITY_NAME[drillIntensity], surge);
  return Number(chargedDrain(raw).toFixed(2));
}
