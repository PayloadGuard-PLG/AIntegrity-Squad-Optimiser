import type { CoachScanResult } from './coachScanner';

// Kept for UI informational display only — not used in gain formula.
export const CATEGORY_STATS: Record<string, string[]> = {
  Attacking:  ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING'],
  Defending:  ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],
  Physical:   ['FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY'],
  Safeguard:  ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],
  Goalkeeping: ['REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION',
                'THROWING', 'KICKING', 'PUNCHING', 'AERIAL REACH', 'CONCENTRATION', 'FITNESS'],
};

export const TRAINING_CAMP_SENTINEL = '__TRAINING_CAMP__';
export const ALL_ROUND_SENTINEL = '__ALL_ROUND__';

/**
 * Stat resolution from a coach scan.
 *
 * Standard and Extensive coaches always train the full category (5 stats for outfield,
 * 11 for GK). Arrow icons on non-highlighted rows are not readable by ML Kit, so OCR
 * routinely returns fewer than the full count. For these types the category defines the
 * stat list — always use CATEGORY_STATS so the budget is divided correctly.
 *
 * Focused coaches boost 1–2 stats; Reward Coaches boost a custom cross-category set.
 * Both rely on OCR detection (or the manual focused-stat picker for Focused).
 */
export function resolveCoachStats(
  scan: CoachScanResult,
  _playerStats: Record<string, number>,
  _playerRole: string[],
): string[] {
  if (scan.isAllRound) return [ALL_ROUND_SENTINEL];

  // Standard / Extensive: return the full confirmed category list regardless of OCR count.
  // Reward Coaches and Focused coaches are excluded — OCR (or manual picker) drives those.
  if (
    !scan.isRewardCoach &&
    (scan.coachType === 'Standard' || scan.coachType === 'Extensive') &&
    scan.coachCategory
  ) {
    return CATEGORY_STATS[scan.coachCategory] ?? [];
  }

  const detected = Array.from(new Set(scan.stats.map(s => s.statName)));
  return detected;
}
