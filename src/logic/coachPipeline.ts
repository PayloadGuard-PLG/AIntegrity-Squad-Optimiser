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
 * The coach name/type/category has no bearing on gains — only the stats
 * with visible ranges in the scan matter, plus ×N and player attributes.
 * Trust what OCR detected. Nothing more.
 */
export function resolveCoachStats(
  scan: CoachScanResult,
  _playerStats: Record<string, number>,
  _playerRole: string[],
): string[] {
  if (scan.isAllRound) return [ALL_ROUND_SENTINEL];
  const detected = Array.from(new Set(scan.stats.map(s => s.statName)));
  return detected;
}
