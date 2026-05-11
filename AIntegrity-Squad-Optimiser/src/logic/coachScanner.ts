import TextRecognition from '@react-native-ml-kit/text-recognition';
import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';

const ALL_STATS = new Set([...OUTFIELD_STATS, ...GK_STATS]);
const Y_TOL = 18;
const GAIN_RE = /\+(\d+)[–\-—](\d+)/;
const OVR_BOOST_RE = /\+(\d+)[–\-—](\d+)/;

export const COACH_TYPES    = ['Standard', 'Focused', 'Extensive'] as const;
export const COACH_CATS     = ['Attacking', 'Defending', 'Physical', 'Safeguard'] as const;
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

export interface CoachScanResult {
  coachType?: CoachType;
  coachCategory?: CoachCategory;
  multiplier?: number;
  playerName?: string;
  playerAge?: number;
  talentTier?: TalentOption;
  ovrBefore?: number;
  ovrBoostLo?: number;
  ovrBoostHi?: number;
  stats: StatCapture[];
}

const TIMEOUT_MS = 5000;

export async function scanCoachPreview(imageUri: string): Promise<CoachScanResult> {
  const result = await Promise.race([
    TextRecognition.recognize(imageUri),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ML Kit timed out')), TIMEOUT_MS)
    ),
  ]);
  const fullText = result.text;

  type Token = { text: string; top: number; left: number };
  const tokens: Token[] = result.blocks
    .flatMap(b => b.lines)
    .flatMap(l => l.elements)
    .map(e => ({ text: e.text.trim(), top: e.frame?.top ?? 0, left: e.frame?.left ?? 0 }))
    .filter(t => t.text.length > 0);

  // Header: "Standard Defending ×20"
  const headerRe = /\b(Standard|Focused|Extensive)\b[^\n]*\b(Attacking|Defending|Physical|Safeguard)\b[^\n]*[×xX]\s*(\d+)/i;
  const headerMatch = headerRe.exec(fullText);
  const coachType     = headerMatch ? (headerMatch[1] as CoachType)     : undefined;
  const coachCategory = headerMatch ? (headerMatch[2] as CoachCategory) : undefined;
  const multiplier    = headerMatch ? parseInt(headerMatch[3])           : undefined;

  const ovrMatch  = /\bOVR\b[^\d]*(\d{2,3})/i.exec(fullText) ?? /(\d{2,3})\s*OVR/i.exec(fullText);
  const ovrBefore = ovrMatch ? parseInt(ovrMatch[1]) : undefined;

  const textAfterOvr = ovrMatch ? fullText.slice(ovrMatch.index + ovrMatch[0].length) : fullText;
  const boostMatch   = OVR_BOOST_RE.exec(textAfterOvr);
  const ovrBoostLo   = boostMatch ? parseInt(boostMatch[1]) : undefined;
  const ovrBoostHi   = boostMatch ? parseInt(boostMatch[2]) : undefined;

  const ageMatch  = /\bAge\s*:?\s*(\d{2})\b/i.exec(fullText);
  const playerAge = ageMatch ? parseInt(ageMatch[1]) : undefined;

  const talentMatch = /\b(FT1|FT2|FT3|Normal|Slow)\b/i.exec(fullText);
  const talentTier  = talentMatch ? (talentMatch[1] as TalentOption) : undefined;

  const nameBlock = result.blocks.find(b => {
    const t = b.text.trim();
    return (
      t.length >= 3 && /^[A-Z][a-z]/.test(t) && !/^\d+$/.test(t) &&
      !['Standard', 'Focused', 'Extensive', 'Attacking', 'Defending', 'Physical', 'Safeguard'].includes(t)
    );
  });
  const playerName = nameBlock?.text.trim();

  // Stat rows — only rows with a gain range (+lo–hi) are highlighted stats
  const used = new Set<number>();
  const stats: StatCapture[] = [];

  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const tok = tokens[i];
    const upper = tok.text.toUpperCase();

    let statName = '';
    let consumed = [i];

    if (ALL_STATS.has(upper as any)) {
      statName = upper;
    } else if (i + 1 < tokens.length) {
      const next = tokens[i + 1];
      const twoWord = upper + ' ' + next.text.toUpperCase();
      if (ALL_STATS.has(twoWord as any) && Math.abs(next.top - tok.top) < Y_TOL) {
        statName = twoWord;
        consumed = [i, i + 1];
      }
    }

    if (!statName) continue;

    const rowTokens = tokens.filter((t, idx) =>
      !consumed.includes(idx) && Math.abs(t.top - tok.top) < Y_TOL
    );
    const rowText = rowTokens.map(t => t.text).join(' ');

    const gainMatch = GAIN_RE.exec(rowText);
    if (gainMatch) {
      const rowNums = rowTokens
        .map(t => parseInt(t.text, 10))
        .filter(n => !isNaN(n) && n > 0 && n <= 340);
      const statBefore = rowNums[0] ?? 0;
      stats.push({
        statName,
        statBefore,
        gainLo: parseInt(gainMatch[1]),
        gainHi: parseInt(gainMatch[2]),
      });
    }

    consumed.forEach(idx => used.add(idx));
  }

  return { coachType, coachCategory, multiplier, playerName, playerAge, talentTier, ovrBefore, ovrBoostLo, ovrBoostHi, stats };
}
