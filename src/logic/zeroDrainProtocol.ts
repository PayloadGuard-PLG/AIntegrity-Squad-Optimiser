import { SurgeState, SURGE_STATE_SEASON_START } from '../types/resources';
import { findSubFloorBundle } from './zeroDrainEngine';

/**
 * RETIRED: the 0.00% condition-loss strategy no longer exists.
 *
 * The game patched it. Every training session is now charged a minimum of 1%,
 * confirmed from training history: single drills whose raw drain is 0.750% are
 * charged -1.00%. Chasing sub-threshold drills is now a PENALTY, not an exploit —
 * a 0.375% drill costs the same 1% as a 0.750% one.
 *
 * The replacement optimisation is bundling: see findSubFloorBundle.
 */
export function getZeroDrainStrategy() {
  return {
    status: 'retired' as const,
    reason: 'The 0% condition-loss loophole was patched. All sessions are charged a 1% minimum.',
    replacement: 'findSubFloorBundle — pack several drills under one minimum charge.',
  };
}

/** @deprecated Always false. Retained so callers fail loudly rather than silently. */
export function validateZeroDrain(): boolean {
  return false;
}

/**
 * Whether the bundling optimisation is available in the given surge state.
 * True only when Perfect Conditions is active at level 4.
 */
export function isBundlingAvailable(surge: SurgeState = SURGE_STATE_SEASON_START): boolean {
  return findSubFloorBundle(surge) !== null;
}
