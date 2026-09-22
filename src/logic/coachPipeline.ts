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
 * Coach type/category are metadata. They do NOT determine the affected-stat set.
 * Live Drill Session evidence falsifies the old "Standard/Extensive = full category"
 * assumption: a Standard Attacking coach can target only a subset of attacking stats.
 *
 * Therefore only targets actually observed by OCR are returned here. If OCR cannot
 * resolve the highlighted rows, the UI must leave the target set unresolved until the
 * user confirms the exact affected stats manually.
 */
export function resolveCoachStats(
  scan: CoachScanResult,
  _playerStats: Record<string, number>,
  _playerRole: string[],
): string[] {
  if (scan.isAllRound) return [ALL_ROUND_SENTINEL];

  const detected = Array.from(new Set(scan.affectedStats));

  // Training Camp is a different programme family. Preserve only observed targets;
  // never expand it to a Resource Coach category shape.
  if (scan.sourceFamily === 'training-camp') return detected;

  return detected;
}
