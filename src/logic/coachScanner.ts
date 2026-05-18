import TextRecognition from '@react-native-ml-kit/text-recognition';
import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';

const ALL_STATS = new Set([...OUTFIELD_STATS, ...GK_STATS]);

// ML Kit misreads seen on coach preview stat labels
const COACH_OCR_CORRECTIONS: Record<string, string> = {
  'ANTICIPATIO':  'ANTICIPATION',
  'ANTICIPAT1ON': 'ANTICIPATION',
  'CONCENTRAT1ON': 'CONCENTRATION',
  'COMMUNICAT1ON': 'COMMUNICATION',
};

// Category stat sets used to filter the embedded-pass — prevents PHY-column stats
// (e.g. AGGRESSION) from being captured when a DEF-column stat's rowText spans all 3 columns.
// Must be kept in sync with CATEGORY_STATS in coachPipeline.ts.
const CATEGORY_STAT_SETS: Record<string, Set<string>> = {
  Attacking:   new Set(['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING']),
  Defending:   new Set(['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY']),
  Physical:    new Set(['FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY']),
  Safeguard:   new Set(['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY']),
  Goalkeeping: new Set([...GK_STATS]),
};

 // two-word stat name detection (RUSHING OUT, AERIAL REACH)
const Y_TOL_VAL  = 18; // gain range row lookup — tighter than row spacing to prevent adjacent-row bleed
const GAIN_RE_STAT = /\+?\s*(\d+)\s*[–\-—]\s*(\d+)/; // + optional: OCR drops it on bright teal backgrounds
const GAIN_RE_OVR  = /\+\s*(\d+)\s*[–\-—]\s*(\d+)/;  // + required for OVR boost (avoids N-N false matches)
// Arrow OCR candidates seen on highlighted rows when no player is selected
const ARROW_RE = /[↑\^›>▲]/;

export const COACH_TYPES    = ['Standard', 'Focused', 'Extensive'] as const;
export const COACH_CATS     = ['Attacking', 'Defending', 'Physical', 'Safeguard', 'Goalkeeping'] as const;
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

  // Use line-level tokens — element arrays are sparse/empty on many devices;
  // lines always have populated text and frame data.
  type Token = { text: string; top: number; left: number };
  const tokens: Token[] = (result.blocks ?? [])
    .flatMap(b => b.lines)
    .map(l => ({
      text: l.text.trim(),
      top:  l.frame?.top  ?? 0,
      left: l.frame?.left ?? 0,
    }))
    .filter(t => t.text.length > 0);

  console.log('[COACH SCAN] token count:', tokens.length);

  // Detect type, category, and multiplier independently — tolerates multi-line OCR output.
  // Normalise captured text to canonical title-case (OCR may return all-caps e.g. "FOCUSED").
  const rawType = (/\b(Standard|Focused|Extensive)\b/i.exec(fullText))?.[1];
  const coachType = rawType
    ? COACH_TYPES.find(t => t.toLowerCase() === rawType.toLowerCase())
    : undefined;
  const rawCat = (/\b(Attacking|Defending|Physical|Safeguard|Goalkeeping)\b/i.exec(fullText))?.[1];
  const coachCategory = rawCat
    ? COACH_CATS.find(c => c.toLowerCase() === rawCat.toLowerCase())
    : undefined;
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
  // Note: stat names and their gain ranges are always in different ML Kit blocks — do NOT
  // restrict by blockIdx or gains will never be found.
  const used = new Set<number>();
  const captureMap = new Map<string, StatCapture>();

  function upsertCapture(candidate: StatCapture): void {
    const existing = captureMap.get(candidate.statName);
    if (!existing) { captureMap.set(candidate.statName, candidate); return; }
    // Prefer a real baseline value over an arrow-only capture (statBefore === 0)
    if (candidate.statBefore > 0 && existing.statBefore === 0) {
      captureMap.set(candidate.statName, candidate); return;
    }
    // Prefer narrower gain span — indicates a less ambiguous OCR read
    const existingSpan = existing.gainHi - existing.gainLo;
    const candidateSpan = candidate.gainHi - candidate.gainLo;
    if (candidate.statBefore > 0 && candidateSpan < existingSpan) {
      captureMap.set(candidate.statName, candidate);
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const tok = tokens[i];
    const rawUpper = tok.text.toUpperCase();
    const upper = COACH_OCR_CORRECTIONS[rawUpper] ?? rawUpper;

    let statName = '';
    let consumed = [i];

    if (ALL_STATS.has(upper as any)) {
      statName = upper;
    } else if (i + 1 < tokens.length) {
      const next = tokens[i + 1];
      const nextUpper = COACH_OCR_CORRECTIONS[next.text.toUpperCase()] ?? next.text.toUpperCase();
      const twoWord = upper + ' ' + nextUpper;
      if (ALL_STATS.has(twoWord as any) && Math.abs(next.top - tok.top) < Y_TOL_NAME) {
        statName = twoWord;
        consumed = [i, i + 1];
      }
    }

    if (!statName) continue;

    // Only include tokens on the same row AND to the right of this stat name.
    // Use tighter Y_TOL_VAL to prevent gain ranges from adjacent rows bleeding in.
    const rowTokens = tokens.filter((t, idx) =>
      !consumed.includes(idx) &&
      Math.abs(t.top - tok.top) < Y_TOL_VAL &&
      t.left > tok.left
    );
    const rowText = rowTokens.map(t => t.text).join(' ');

    console.log('[ROW]', statName, JSON.stringify(rowText));

    const gainMatch = GAIN_RE_STAT.exec(rowText);
    if (gainMatch) {
      const lo = parseInt(gainMatch[1]);
      const hi = parseInt(gainMatch[2]);
      // Sanity: lo plausible gain (not a stat value), hi ordered above lo, both in range
      if (lo > 0 && hi > 0 && hi > lo && hi <= 300 && lo <= 150) {
        // Pick the numeric token spatially nearest to the stat name token.
        // rowNums[0] was wrong: in 3-column merged OCR rows the first number may belong
        // to the adjacent column's stat, not to this one.
        const nearestNumTok = rowTokens
          .filter(t => { const n = parseInt(t.text, 10); return !isNaN(n) && n > 0 && n <= 340; })
          .reduce<Token | null>((best, t) =>
            !best || Math.abs(t.left - tok.left) < Math.abs(best.left - tok.left) ? t : best,
          null);
        const statBefore = nearestNumTok ? parseInt(nearestNumTok.text, 10) : 0;
        upsertCapture({ statName, statBefore, gainLo: lo, gainHi: hi });
      }
    }

    // Secondary scan: the game's 3-column layout causes ML Kit to merge adjacent column text
    // into single blocks (e.g. "194 + 4-6 Crossing", "256 Aggression"). ATT/PHY stat names
    // that appear standalone can be detected above, but highlighted ATT/PHY stats whose names
    // are merged into a DEF-column block only appear embedded in this row's right-side text.
    // Match: STATNAME VALUE + lo-hi — the gain MUST follow the stat name and its value.
    // catFilter: when category is known, restrict to category stats only — prevents out-of-category
    // column bleed (e.g. AGGRESSION appearing in POSITIONING's PHY-column rowText).
    const catFilter = coachCategory ? (CATEGORY_STAT_SETS[coachCategory] ?? null) : null;
    for (const candidate of [...OUTFIELD_STATS, ...GK_STATS] as string[]) {
      if (candidate === statName || captureMap.has(candidate)) continue;
      if (catFilter && !catFilter.has(candidate)) continue;
      const escapedName = candidate.replace(/\s+/g, '\\s+');
      const embRE = new RegExp(`\\b${escapedName}\\b\\s+(\\d+)\\s*\\+?\\s*(\\d+)\\s*[-–—]\\s*(\\d+)`, 'i');
      const em = embRE.exec(rowText);
      if (!em) continue;
      const eLo = parseInt(em[2]), eHi = parseInt(em[3]);
      if (eLo > 0 && eHi > 0 && eHi > eLo && eHi <= 300 && eLo <= 150) {
        upsertCapture({ statName: candidate, statBefore: parseInt(em[1]), gainLo: eLo, gainHi: eHi });
      }
    }

    if (!gainMatch) {
      // No-player-selected state: highlighted rows show stat name + ↑ arrow but no values.
      // Arrow is the only differentiator — capture stat name with zero gain values.
      // resolveCoachStats in coachPipeline.ts uses only statName; zero gains are ignored.
      const hasArrow = rowTokens.some(t => ARROW_RE.test(t.text));
      if (hasArrow) {
        upsertCapture({ statName, statBefore: 0, gainLo: 0, gainHi: 0 });
      }
    }

    consumed.forEach(idx => used.add(idx));
  }

  const _debugBlocks = (result.blocks ?? [])
    .map((b, i) => `[${i}] ${b.text.replace(/\n/g, ' ').slice(0, 60)}`)
    .join(' | ');

  const stats = Array.from(captureMap.values());
  return { coachType, coachCategory, multiplier, playerName, playerAge, talentTier, ovrBefore, ovrBoostLo, ovrBoostHi, stats, _debugBlocks };
}
