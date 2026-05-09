import TextRecognition from '@react-native-ml-kit/text-recognition';
import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';

const ALL_STATS = new Set([...OUTFIELD_STATS, ...GK_STATS]);
const KNOWN_ROLES = ['GK', 'DC', 'DL', 'DR', 'DMC', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST'];
const KNOWN_TIERS = ['Legendary', 'Epic', 'Master', 'Stellar', 'Elite', 'Rare', 'None']; // longest-first for regex
const KNOWN_TALENTS = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'];

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
  _debug?: string; // raw OCR sample for troubleshooting
}

export async function scanPlayerCard(imageUri: string): Promise<PlayerCardScan> {
  const result = await TextRecognition.recognize(imageUri);

  // Flatten to a single list of positioned tokens
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

  // ── stat extraction: Y-baseline pairing ──────────────────────────────────
  const used = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const tok = tokens[i];
    const upper = tok.text.toUpperCase();

    // single-word stat match
    let statName = '';
    let consumed = [i];

    if (ALL_STATS.has(upper)) {
      statName = upper;
    } else if (i + 1 < tokens.length) {
      // two-word stat (RUSHING OUT, AERIAL REACH)
      const next = tokens[i + 1];
      const twoWord = upper + ' ' + next.text.toUpperCase();
      if (ALL_STATS.has(twoWord) && Math.abs(next.top - tok.top) < Y_TOL) {
        statName = twoWord;
        consumed = [i, i + 1];
      }
    }

    if (!statName) continue;

    // find a numeric value on the same horizontal baseline
    const rowNums = tokens
      .filter((t, idx) => !consumed.includes(idx) && Math.abs(t.top - tok.top) < Y_TOL)
      .map(t => parseInt(t.text, 10))
      .filter(n => !isNaN(n) && n > 0 && n <= 340);

    if (rowNums.length > 0) {
      stats[statName] = rowNums[0];
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

  // ── OVR ─────────────────────────────────────────────────────────────────
  const ovrMatch = /\bOVR\b[^\d]*(\d{2,3})/i.exec(fullText)
    ?? /(\d{2,3})\s*OVR/i.exec(fullText);
  const overall = ovrMatch ? parseInt(ovrMatch[1]) : undefined;

  // ── Age ─────────────────────────────────────────────────────────────────
  const ageMatch = /\bAge\s*:?\s*(\d{2})\b/i.exec(fullText)
    ?? /\b(\d{2})\s*(?:yr|years?)\b/i.exec(fullText);
  const age = ageMatch ? parseInt(ageMatch[1]) : undefined;

  // ── Roles ────────────────────────────────────────────────────────────────
  const roles = KNOWN_ROLES.filter(r => new RegExp(`\\b${r}\\b`, 'i').test(fullText));

  // ── Tier ─────────────────────────────────────────────────────────────────
  const tier = KNOWN_TIERS.find(t => new RegExp(`\\b${t}\\b`, 'i').test(fullText));

  // ── Talent ───────────────────────────────────────────────────────────────
  const talent = KNOWN_TALENTS.find(t => new RegExp(`\\b${t}\\b`, 'i').test(fullText));

  // ── Name ─────────────────────────────────────────────────────────────────
  // Heuristic: largest text block that looks like a proper name
  const nameBlock = result.blocks.find(b => {
    const t = b.text.trim();
    return (
      t.length >= 3 &&
      /^[A-Z][a-zA-Z]/.test(t) &&
      !KNOWN_ROLES.includes(t.toUpperCase()) &&
      !KNOWN_TIERS.some(tier => t.toLowerCase() === tier.toLowerCase()) &&
      !/^\d+$/.test(t)
    );
  });
  const name = nameBlock?.text.trim();

  const _debug = fullText.replace(/\n/g, ' | ').slice(0, 300);
  return { name, age, roles: roles.length > 0 ? roles : undefined, overall, tier, talent, stats, _debug };
}
