// Pure TypeScript — no native deps.
// OCR integration point is marked TODO below; manual entry works today.

import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';

export const COACH_TYPES   = ['Standard', 'Focused', 'Extensive'] as const;
export const COACH_CATS    = ['Attacking', 'Defending', 'Physical', 'Safeguard'] as const;
export const TALENT_OPTIONS = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'] as const;

export type CoachType     = typeof COACH_TYPES[number];
export type CoachCategory = typeof COACH_CATS[number];
export type TalentOption  = typeof TALENT_OPTIONS[number];

export interface StatCapture {
  statName: string;
  statBefore: number;
  gainLo: number;
  gainHi: number;
}

export interface CoachSessionCapture {
  sessionId: string;
  date: string;
  playerName: string;
  playerAge: number;
  talentTier: TalentOption;
  twoXAd: boolean;
  coachType: CoachType;
  coachCategory: CoachCategory;
  multiplier: number;
  ovrBefore: number;
  ovrBoostLo: number;
  ovrBoostHi: number;
  stats: StatCapture[];
}

export function buildCsvRows(session: CoachSessionCapture): string[] {
  const nStats = session.stats.length;
  return session.stats.map(s =>
    [
      session.sessionId,
      session.date,
      session.playerName,
      session.playerAge,
      session.talentTier,
      session.twoXAd ? 'yes' : 'no',
      session.coachType,
      session.coachCategory,
      session.multiplier,
      nStats,
      s.statName,
      s.statBefore,
      s.gainLo,
      s.gainHi,
      session.ovrBefore,
      session.ovrBoostLo,
      session.ovrBoostHi,
      '',
    ].join(',')
  );
}

export function getNextSessionId(csvContent: string): string {
  const matches = [...csvContent.matchAll(/^S(\d+),/gm)];
  if (matches.length === 0) return 'S1';
  const max = Math.max(...matches.map(m => parseInt(m[1], 10)));
  return `S${max + 1}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function statListForRoles(roles: string[]): string[] {
  return roles.includes('GK') ? GK_STATS : OUTFIELD_STATS;
}

// ─── OCR integration point ────────────────────────────────────────────────────
// When @react-native-ml-kit/text-recognition is in the binary build, implement:
//
// import TextRecognition from '@react-native-ml-kit/text-recognition';
// const Y_TOL = 15;
// const GAIN_RE = /\+(\d+)[–\-—](\d+)/;
//
// export async function scanCoachPreview(imagePath: string): Promise<Partial<CoachSessionCapture>> {
//   const all = [...OUTFIELD_STATS, ...GK_STATS];
//   const rec = await TextRecognition.recognize(imagePath);
//   const blocks = rec.blocks.flatMap(b => b.lines).flatMap(l => l.elements);
//   // ... parse header, player card, stat rows using Y-baseline grouping
//   // See data/OCR_SCANNER_SPEC.md for full algorithm
//   return parsed;
// }
//
// In scan.tsx, replace the manual form with:
//   const partial = await scanCoachPreview(pickedImageUri);
//   prefillFormWith(partial);  // user confirms / corrects before saving
