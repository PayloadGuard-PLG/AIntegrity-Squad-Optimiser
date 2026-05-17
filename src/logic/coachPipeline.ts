import type { CoachScanResult } from './coachScanner';
import { getWhiteStatKeys } from '../utils/roleWeights';

export const CATEGORY_STATS: Record<string, string[]> = {
  Attacking:  ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING'],
  Defending:  ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],
  Physical:   ['FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY'],
  // All 10 GK stats + Fitness — Standard Goalkeeping boosts all of these
  Safeguard:  ['REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION',
               'THROWING', 'KICKING', 'PUNCHING', 'AERIAL REACH', 'CONCENTRATION', 'FITNESS'],
};

/**
 * Deterministic stat resolution from a coach scan result.
 * Returns 1–15 stat names. Never hard-caps at 5.
 *
 * Decision chain:
 * 1. Stats detected + category known:
 *    - Contamination check: if more out-of-category than in-category, restrict to in-category
 *    - Otherwise: trust all detected stats (clean or extensive coach, up to 15)
 * 2. Stats detected + category unknown: use all detected (best effort)
 * 3. No stats detected + category known: full category filtered to player's available stats
 * 4. Nothing → white stats for player's role
 */
export function resolveCoachStats(
  scan: CoachScanResult,
  playerStats: Record<string, number>,
  playerRole: string[],
): string[] {
  const catList = scan.coachCategory ? (CATEGORY_STATS[scan.coachCategory] ?? []) : null;
  const detected = scan.stats.map(s => s.statName);

  if (detected.length > 0) {
    if (catList) {
      const inCat  = detected.filter(n =>  catList.includes(n));
      const outCat = detected.filter(n => !catList.includes(n));
      // Contamination: more out-of-category than in-category → cross-column OCR leakage
      if (outCat.length >= inCat.length && inCat.length > 0) return inCat;
      return detected;  // clean or extensive scan (1–15 stats)
    }
    return detected;  // category unknown — use all detected
  }

  // No stat rows found — use category header as fallback
  if (scan.coachType === 'Focused') {
    // Arrow characters in the no-player state are not read by ML Kit OCR, so highlighted
    // stats cannot be auto-detected. Return [] — the coaches tab shows the category picker
    // chips so the user can select the 1–2 boosted stats manually.
    // Workaround: scan the tile with any player selected; the game then shows gain ranges
    // (+lo-hi) as text, which the scanner detects reliably.
    return [];
  }
  if (catList) {
    const fromCat = catList.filter(s => playerStats[s] !== undefined);
    if (fromCat.length > 0) return fromCat;
  }

  return getWhiteStatKeys(playerRole);
}
