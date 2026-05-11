import TextRecognition from '@react-native-ml-kit/text-recognition';
import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';

const ALL_STATS = new Set([...OUTFIELD_STATS, ...GK_STATS]);
const KNOWN_ROLES = ['GK', 'DC', 'DL', 'DR', 'DMC', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST'];
const KNOWN_TIERS = ['Legendary', 'Epic', 'Master', 'Stellar', 'Elite', 'Rare'];
const KNOWN_TALENTS = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'];
const TALENT_NAME_MAP: Record<string, string> = {
  FT1: 'Fastest', FT2: 'Fast', FT3: 'Average',
};

const Y_TOL = 28;   // px — tolerance for same-row Y-baseline grouping
const Y_BELOW = 65; // px — tolerance for value directly below stat label

export interface PlayerCardScan {
  name?: string;
  age?: number;
  roles?: string[];
  overall?: number;
  tier?: string;
  talent?: string;
  stats: Record<string, number>;
  _debug?: string;
}

// Game UI labels that pass the name regex but are not player names
const UI_BLOCKLIST = ['Squad', 'Contract', 'Overview', 'Skills', 'Stats', 'Training',
  'Playstyle', 'Celebrations', 'Trainer', 'Personal', 'Defence', 'Attack', 'Physical',
  'Special', 'Ability', 'Team', 'None', 'Select', 'Player', 'Start',
  'Goal Celebrations', 'Personal Trainer', 'Special Ability'];

const TIER_NAME_MAP: Record<string, string> = {
  None: 'T0', Rare: 'T1', Elite: 'T2', Stellar: 'T3', Master: 'T4', Epic: 'T5', Legendary: 'T6',
};

const TIMEOUT_MS = 5000;

export async function scanPlayerCard(imageUri: string): Promise<PlayerCardScan> {
  const result = await Promise.race([
    TextRecognition.recognize(imageUri),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ML Kit timed out — New Architecture may be incompatible. Rebuild with newArchEnabled:false.')), TIMEOUT_MS)
    ),
  ]);

  type Token = { text: string; top: number; left: number };
  const tokens: Token[] = result.blocks
    .flatMap(b => b.lines)
    .flatMap(l => l.elements)
    .map(e => ({
      text: e.text.trim(),
      top: e.frame?.top ?? 0,
      left: e.frame?.left ?? 0,
    }))
    .filter(t => t.text.length > 0);

  const fullText = result.text;
  const stats: Record<string, number> = {};

  const used = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const tok = tokens[i];
    const upper = tok.text.toUpperCase();

    let statName = '';
    let consumed = [i];

    if (ALL_STATS.has(upper as any)) {
      statName = upper;
    } else if (i + 1 < tokens.length) {
      // two-word stats: RUSHING OUT, AERIAL REACH
      const next = tokens[i + 1];
      const twoWord = upper + ' ' + next.text.toUpperCase();
      if (ALL_STATS.has(twoWord as any) && Math.abs(next.top - tok.top) < Y_TOL) {
        statName = twoWord;
        consumed = [i, i + 1];
      }
    }

    if (!statName) continue;

    // Find closest number to the RIGHT on the same baseline.
    // The game shows 3 stat columns side by side, so each row has 3 names and 3 values.
    const sameRow = tokens.filter((t, idx) =>
      !consumed.includes(idx) && Math.abs(t.top - tok.top) < Y_TOL
    );
    const rightNums = sameRow
      .filter(t => t.left > tok.left)
      .sort((a, b) => a.left - b.left)
      .map(t => parseInt(t.text, 10))
      .filter(n => !isNaN(n) && n > 0 && n <= 340);

    if (rightNums.length > 0) {
      stats[statName] = rightNums[0];
    } else {
      // Fallback: value may be directly below the label (vertically stacked layout)
      const belowNums = tokens
        .filter((t, idx) =>
          !consumed.includes(idx) &&
          t.top > tok.top &&
          t.top - tok.top < Y_BELOW &&
          Math.abs(t.left - tok.left) < 100
        )
        .sort((a, b) => a.top - b.top)
        .map(t => parseInt(t.text, 10))
        .filter(n => !isNaN(n) && n > 0 && n <= 340);
      if (belowNums.length > 0) stats[statName] = belowNums[0];
    }
    consumed.forEach(idx => used.add(idx));
  }

  const ovrMatch = /\bOVR\b[^\d]*(\d{2,3})/i.exec(fullText)
    ?? /(\d{2,3})\s*OVR/i.exec(fullText);
  const overall = ovrMatch ? parseInt(ovrMatch[1]) : undefined;

  const ageMatch = /\bAge\s*:?\s*(\d{2})\b/i.exec(fullText)
    ?? /\b(\d{2})\s*(?:yr|years?)\b/i.exec(fullText);
  const age = ageMatch ? parseInt(ageMatch[1]) : undefined;

  // Match roles by exact token equality (avoids partial-word false positives like "DR" in "DRILLS")
  const roleSet = new Set(KNOWN_ROLES.map(r => r.toUpperCase()));
  const foundRoles = new Set<string>();
  for (const t of tokens) {
    t.text.toUpperCase().split(/[\s,./|·•·]+/).forEach(part => {
      if (part.trim() && roleSet.has(part.trim())) foundRoles.add(part.trim());
    });
  }
  const roles = KNOWN_ROLES.filter(r => foundRoles.has(r));

  const rawTier = KNOWN_TIERS.find(t => new RegExp(`\\b${t}\\b`, 'i').test(fullText));
  const tier = rawTier ? (TIER_NAME_MAP[rawTier] ?? rawTier) : undefined;

  const rawTalent = KNOWN_TALENTS.find(t => new RegExp(`\\b${t}\\b`, 'i').test(fullText));
  const talent = rawTalent ? (TALENT_NAME_MAP[rawTalent] ?? rawTalent) : undefined;

  const nameCandidates = result.blocks.filter(b => {
    const t = b.text.trim();
    return (
      t.length >= 3 &&
      /^[A-Z][a-z]/.test(t) &&
      !KNOWN_ROLES.includes(t.toUpperCase()) &&
      !KNOWN_TIERS.some(tier => t.toLowerCase() === tier.toLowerCase()) &&
      !UI_BLOCKLIST.some(kw =>
        kw.includes(' ')
          ? t.toLowerCase().includes(kw.toLowerCase())
          : t.toLowerCase() === kw.toLowerCase()
      ) &&
      !/^\d+$/.test(t)
    );
  });
  const nameBlock = nameCandidates.reduce<typeof nameCandidates[0] | undefined>(
    (best, cur) => (!best || (cur.frame?.top ?? 999) < (best.frame?.top ?? 999)) ? cur : best,
    undefined
  );
  const name = nameBlock?.text.trim();

  const _debug = fullText.replace(/\n/g, ' | ').slice(0, 300);
  return { name, age, roles: roles.length > 0 ? roles : undefined, overall, tier, talent, stats, _debug };
}
