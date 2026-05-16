import TextRecognition from '@react-native-ml-kit/text-recognition';
import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';

const ALL_STATS = new Set([...OUTFIELD_STATS, ...GK_STATS]);
const Y_TOL_NAME = 25; // two-word stat name detection (RUSHING OUT, AERIAL REACH)
const Y_TOL_VAL  = 18; // gain range row lookup — tighter than row spacing to prevent adjacent-row bleed
const GAIN_RE_STAT = /\+?\s*(\d+)\s*[–\-—]\s*(\d+)/; // + optional: OCR drops it on bright teal backgrounds
const GAIN_RE_OVR  = /\+\s*(\d+)\s*[–\-—]\s*(\d+)/;  // + required for OVR boost (avoids N-N false matches)
const ARROW_RE     = /[↑\^›>▲]/;                      // highlighted-stat indicator (no-player state)

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
  talentTier?: string;
  ovrBefore?: number;
  ovrBoostLo?: number;
  ovrBoostHi?: number;
  stats: StatCapture[];
  _debugBlocks?: string;
}

const TIMEOUT_MS = 5000;

export async function scanCoachPreview(imageUri: string): Promise<CoachScanResult> {
  const result = await Promise.race([
    TextRecognition.recognize(imageUri),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ML Kit timed out')), TIMEOUT_MS)
    ),
  ]);
  const fullText = result.text ?? '';

  type Token = { text: string; top: number; left: number; blockIdx: number };
  const tokens: Token[] = (result.blocks ?? [])
    .flatMap((b, blockIdx) =>
      b.lines.flatMap(l =>
        l.elements.map(e => ({
          text: e.text.trim(),
          top:  e.frame?.top  ?? 0,
          left: e.frame?.left ?? 0,
          blockIdx,
        }))
      )
    )
    .filter(t => t.text.length > 0);

  // Detect type, category, and multiplier independently — tolerates multi-line OCR output
  const coachType     = (/\b(Standard|Focused|Extensive)\b/i.exec(fullText))?.[1] as CoachType | undefined;
  const coachCategory = (/\b(Attacking|Defending|Physical|Safeguard)\b/i.exec(fullText))?.[1] as CoachCategory | undefined;
  // Search for multiplier starting from the coach type/category keyword to avoid picking up
  // any ×N pattern that appears earlier in the image (e.g. session counts, player bonuses).
  const typeIdx    = fullText.search(/\b(Standard|Focused|Extensive)\b/i);
  const searchFrom = typeIdx >= 0 ? fullText.slice(typeIdx) : fullText;
  const multMatch  = /[×xX*✕]\s*(\d+)/.exec(searchFrom);
  const multiplier = multMatch ? parseInt(multMatch[1]) : undefined;

  const ovrMatch  = /\bOVR\b[^\d]*(\d{2,3})/i.exec(fullText) ?? /(\d{2,3})\s*OVR/i.exec(fullText);
  const ovrBefore = ovrMatch ? parseInt(ovrMatch[1]) : undefined;

  const textAfterOvr = ovrMatch ? fullText.slice(ovrMatch.index + ovrMatch[0].length) : fullText;
  const boostMatch   = GAIN_RE_OVR.exec(textAfterOvr);
  const ovrBoostLo   = boostMatch ? parseInt(boostMatch[1]) : undefined;
  const ovrBoostHi   = boostMatch ? parseInt(boostMatch[2]) : undefined;

  const ageMatch  = /\bAge\s*:?\s*(\d{2})\b/i.exec(fullText);
  const playerAge = ageMatch ? parseInt(ageMatch[1]) : undefined;

  const talentMatch = /\b(FT1|FT2|FT3|Normal|Slow)\b/i.exec(fullText);
  const TALENT_MAP: Record<string, string> = { FT1: 'Fastest', FT2: 'Fast', FT3: 'Average' };
  const talentTier  = talentMatch ? (TALENT_MAP[talentMatch[1]] ?? talentMatch[1]) : undefined;

  const nameBlock = result.blocks.find(b => {
    const t = b.text.trim();
    return (
      t.length >= 3 && /^[A-Z][a-z]/.test(t) && !/^\d+$/.test(t) &&
      !['Standard', 'Focused', 'Extensive', 'Attacking', 'Defending', 'Physical', 'Safeguard',
        'Select', 'Training', 'Session', 'Start', 'Reward'].some(w => t.toLowerCase().includes(w.toLowerCase()))
    );
  });
  const playerName = nameBlock?.text.trim();

  // Stat rows: find stat names, then look ONLY to the right of the stat name for gain ranges.
  // The game shows 3 columns side by side (Defense / Attack / Physical). Stats in different
  // columns share the same Y row. Restricting to t.left > tok.left prevents picking up a
  // gain range from column 1 (e.g. Tackling +57-71) when processing a column 2 stat (Passing).
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
      if (ALL_STATS.has(twoWord as any) && Math.abs(next.top - tok.top) < Y_TOL_NAME) {
        statName = twoWord;
        consumed = [i, i + 1];
      }
    }

    if (!statName) continue;

    // Only include tokens on the same row AND to the right of this stat name AND in the same
    // ML Kit block. Highlighted stat cells have a distinct background — ML Kit typically puts
    // them in a separate block. Restricting to the same block + tighter Y_TOL_VAL prevents
    // gain ranges from adjacent rows or columns bleeding into the wrong stat.
    const rowTokens = tokens.filter((t, idx) =>
      !consumed.includes(idx) &&
      Math.abs(t.top - tok.top) < Y_TOL_VAL &&
      t.left > tok.left &&
      t.blockIdx === tok.blockIdx
    );
    const rowText = rowTokens.map(t => t.text).join(' ');

    const gainMatch = GAIN_RE_STAT.exec(rowText);
    if (gainMatch) {
      const lo = parseInt(gainMatch[1]);
      const hi = parseInt(gainMatch[2]);
      // Sanity: lo plausible gain (not a stat value), hi ordered above lo, both in range
      if (lo > 0 && hi > 0 && hi > lo && hi <= 300 && lo <= 150) {
        const rowNums = rowTokens
          .map(t => parseInt(t.text, 10))
          .filter(n => !isNaN(n) && n > 0 && n <= 340);
        const statBefore = rowNums[0] ?? 0;
        stats.push({ statName, statBefore, gainLo: lo, gainHi: hi });
      }
    } else {
      // No gain range found — check for arrow indicator (no-player-selected state).
      // The game shows ↑ next to highlighted stats before a player is chosen.
      const hasArrow = rowTokens.some(t => ARROW_RE.test(t.text));
      if (hasArrow) {
        stats.push({ statName, statBefore: 0, gainLo: 0, gainHi: 0 });
      }
    }

    consumed.forEach(idx => used.add(idx));
  }

  const _debugBlocks = (result.blocks ?? [])
    .map((b, i) => `[${i}] ${b.text.replace(/\n/g, ' ').slice(0, 60)}`)
    .join(' | ');

  return { coachType, coachCategory, multiplier, playerName, playerAge, talentTier, ovrBefore, ovrBoostLo, ovrBoostHi, stats, _debugBlocks };
}
