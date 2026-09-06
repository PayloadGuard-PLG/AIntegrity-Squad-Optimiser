/**
 * playerCardParse — the pure, React-Native-free half of the player-card scanner.
 *
 * `parsePlayerCardText` is the EXISTING ML Kit text/number parsing, moved here
 * verbatim from playerScanner.ts so it can be exercised without loading the
 * native ML Kit module. Its behaviour is frozen and covered byte-for-byte by
 * tests/fixtures/scan-golden.json — do not change it.
 *
 * `parsePlayerCard` layers the glyph readers on top and is where every new
 * field and every abstention flag comes from.
 */

import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';
import {
  readGlyphs, RgbaImage, GlyphToken, GlyphContext, BoostCandidate,
  PlaystyleFamily, StatBoost, ReviewFlag,
} from './glyphReader';

const ALL_STATS = new Set([...OUTFIELD_STATS, ...GK_STATS]);

// OCR misread corrections — applied before stat lookup
const OCR_STAT_CORRECTIONS: Record<string, string> = {
  'TACKIING': 'TACKLING',
  'TACKL1NG': 'TACKLING',
};
const KNOWN_ROLES = ['GK', 'DC', 'DL', 'DR', 'DMC', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST'];
const ROLES_BY_LEN = [...KNOWN_ROLES].sort((a, b) => b.length - a.length);

function splitConcatenatedRoles(token: string): string[] {
  const found: string[] = [];
  let pos = 0;
  while (pos < token.length) {
    const match = ROLES_BY_LEN.find(r => token.startsWith(r, pos));
    if (!match) break;
    found.push(match);
    pos += match.length;
  }
  return pos === token.length ? found : [];
}
const KNOWN_TIERS = ['Legendary', 'Epic', 'Master', 'Stellar', 'Elite', 'Rare'];
const KNOWN_TALENTS = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'];
const TALENT_NAME_MAP: Record<string, string> = {
  FT1: 'Fastest', FT2: 'Fast', FT3: 'Average',
};

const Y_TOL = 28;      // px — two-word stat name detection (RUSHING OUT, AERIAL REACH)
const Y_TOL_VAL = 20;  // px — value lookup (tighter: excludes section-header row numbers)
const Y_BELOW = 40;    // px — below-fallback for value directly below stat label
const Y_TOL_ROLE = 55; // px — role badge detection; wider than Y_TOL to capture 2-row role grids

export interface PlayerCardScan {
  name?: string;
  age?: number;
  roles?: string[];
  overall?: number;
  tier?: string;
  talent?: string;
  stats: Record<string, number>;
  newRole?: string;
  newRolePoints?: number;
  _debug?: string;
}

// Game UI labels that pass the name regex but are not player names
const UI_BLOCKLIST = ['Squad', 'Contract', 'Overview', 'Skills', 'Stats', 'Training',
  'Playstyle', 'Celebrations', 'Trainer', 'Personal', 'Defence', 'Attack', 'Physical',
  'Goalkeeping', 'Safeguard', 'Special', 'Ability', 'Team', 'None', 'Select', 'Player',
  'Start', 'Reward', 'Goal Celebrations', 'Personal Trainer', 'Special Ability',
  'Age', 'Roles', 'Role', 'Level', 'Points', 'Overall', 'Rating', 'Talent'];

const TIER_NAME_MAP: Record<string, string> = {
  None: 'T0', Rare: 'T1', Elite: 'T2', Stellar: 'T3', Master: 'T4', Epic: 'T5', Legendary: 'T6',
};

// --- Structural mirror of @react-native-ml-kit/text-recognition's result shape.
// Declared locally so this module never imports the native package.
export interface OcrFrame { width: number; height: number; top: number; left: number }
export interface OcrElement { text: string; frame?: OcrFrame }
export interface OcrLine { text: string; frame?: OcrFrame; elements: OcrElement[] }
export interface OcrBlock { text: string; frame?: OcrFrame; lines: OcrLine[] }
export interface OcrResult { text?: string; blocks: OcrBlock[] }

export { KNOWN_ROLES };

/**
 * Selects the player-name block: the topmost title-case block that is not a
 * known UI label. Hoisted out of parsePlayerCardText unchanged so the glyph
 * pass can anchor on the same block the text pass named.
 */
export function findNameBlock(result: OcrResult): OcrBlock | undefined {
  const nameCandidates = result.blocks.filter(b => {
    const t = b.text.trim();
    return (
      t.length >= 3 &&
      /^[A-Z][a-z]/.test(t) &&
      !t.includes('+') &&                                         // role-in-training tokens contain "+"
      !/^Age\s*[:.]?\s*\d/i.test(t) &&                           // "Age: 26" pattern
      !/^\d/.test(t) &&
      !KNOWN_ROLES.includes(t.toUpperCase()) &&
      !KNOWN_TIERS.some(tier => t.toLowerCase() === tier.toLowerCase()) &&
      !UI_BLOCKLIST.some(kw =>
        kw.includes(' ')
          ? t.toLowerCase().includes(kw.toLowerCase())
          : t.toLowerCase() === kw.toLowerCase()
      )
    );
  });
  return nameCandidates.reduce<OcrBlock | undefined>(
    (best, cur) => (!best || (cur.frame?.top ?? 999) < (best.frame?.top ?? 999)) ? cur : best,
    undefined
  );
}

/**
 * FROZEN. The pre-existing ML Kit text pass, moved verbatim from
 * playerScanner.ts. Covered by the regression fixture in tests/scanner-test.ts.
 */
export function parsePlayerCardText(result: OcrResult): PlayerCardScan {
  type Token = { text: string; top: number; left: number };
  const tokens: Token[] = (result.blocks ?? [])
    .flatMap(b => b.lines)
    .flatMap(l => l.elements)
    .map(e => ({
      text: e.text.trim(),
      top: e.frame?.top ?? 0,
      left: e.frame?.left ?? 0,
    }))
    .filter(t => t.text.length > 0);

  const fullText = result.text ?? '';
  const stats: Record<string, number> = {};

  const used = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const tok = tokens[i];
    const upper = OCR_STAT_CORRECTIONS[tok.text.toUpperCase()] ?? tok.text.toUpperCase();

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
    // Use Y_TOL_VAL (tighter than Y_TOL) to exclude section-header row totals
    // (e.g. "DEFENCE 173") which share a close Y with the first stat row.
    const sameRow = tokens.filter((t, idx) =>
      !consumed.includes(idx) && Math.abs(t.top - tok.top) < Y_TOL_VAL
    );
    const rightNums = sameRow
      .filter(t => t.left > tok.left)
      .sort((a, b) => a.left - b.left)
      .map(t => parseInt(t.text, 10))
      .filter(n => !isNaN(n) && n > 0 && n <= 500);

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
        .filter(n => !isNaN(n) && n > 0 && n <= 500);
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

  // Match roles — anchored to the "Roles:" label row when present.
  // The game card shows active roles (highlighted) on one line and inactive positions
  // (dark/black) elsewhere. Anchoring prevents false positives from off-role grid labels.
  const roleSet = new Set(KNOWN_ROLES.map(r => r.toUpperCase()));
  const foundRoles = new Set<string>();

  // Find the "Roles:" label token to get its Y position
  const rolesLabelTok = tokens.find(t => /^roles?\s*:?$/i.test(t.text.trim()));
  const roleRowY = rolesLabelTok?.top;

  const roleSourceTokens = roleRowY != null
    ? tokens.filter(t => Math.abs(t.top - roleRowY) < Y_TOL_ROLE)  // wider: catches 2-row role grids
    : tokens;                                                         // fallback: all tokens

  for (const t of roleSourceTokens) {
    t.text.toUpperCase().split(/[\s,./|·•·()\[\]<>:]+/).forEach(part => {
      const p = part.trim();
      if (p && roleSet.has(p)) {
        foundRoles.add(p);
      } else if (p && p.length >= 4) {
        splitConcatenatedRoles(p).forEach(r => foundRoles.add(r));
      }
    });
  }

  // fullText fallback — only when no "Roles:" anchor found.
  // Splits on non-alpha chars and applies greedy role parser to each segment so
  // concatenated tokens like "DMCMC" (no word boundary) are correctly parsed.
  if (roleRowY == null) {
    fullText.toUpperCase().split(/[^A-Z]+/).forEach(segment => {
      if (!segment) return;
      if (roleSet.has(segment)) {
        foundRoles.add(segment);
      } else if (segment.length >= 4) {
        splitConcatenatedRoles(segment).forEach(r => foundRoles.add(r));
      }
    });
  }

  const roles = KNOWN_ROLES.filter(r => foundRoles.has(r));

  const rawTier = KNOWN_TIERS.find(t => new RegExp(`\\b${t}\\b`, 'i').test(fullText));
  const tier = rawTier ? (TIER_NAME_MAP[rawTier] ?? rawTier) : undefined;

  const rawTalent = KNOWN_TALENTS.find(t => new RegExp(`\\b${t}\\b`, 'i').test(fullText));
  const talent = rawTalent ? (TALENT_NAME_MAP[rawTalent] ?? rawTalent) : undefined;

  // Detect new role in training: "DMC+", "AML+" etc. — role name with "+" suffix
  const newRoleRegex = new RegExp(`\\b(${KNOWN_ROLES.join('|')})\\+`, 'i');
  const newRoleMatch = newRoleRegex.exec(fullText);
  let newRole: string | undefined;
  let newRolePoints: number | undefined;
  if (newRoleMatch) {
    newRole = newRoleMatch[1].toUpperCase();
    // Look for a point count (0–50) near the matching token
    const nrTok = tokens.find(t => new RegExp(`${newRole}\\+`, 'i').test(t.text));
    if (nrTok) {
      const nearby = tokens
        .filter(t => Math.abs(t.top - nrTok.top) < Y_TOL_VAL)
        .map(t => parseInt(t.text, 10))
        .filter(n => !isNaN(n) && n >= 0 && n <= 50);
      if (nearby.length > 0) newRolePoints = nearby[0];
    }
    newRolePoints = newRolePoints ?? 0;
  }

  const nameBlock = findNameBlock(result);
  const name = nameBlock?.text.trim();

  const _debug = fullText.replace(/\n/g, ' | ').slice(0, 300);
  return { name, age, roles: roles.length > 0 ? roles : undefined, overall, tier, talent, stats, newRole, newRolePoints, _debug };
}


// ---------------------------------------------------------------------------
// Extended scan result (spec §4) — additive; nothing above this line changes.
// ---------------------------------------------------------------------------

export interface PlayerCardScanExtended extends PlayerCardScan {
  /** Gold/established chips only — the array roleWeights.ts may consume. */
  establishedRoles?: string[];
  /** The single role being learned (dark chip + X/50), or null when observed absent. */
  learningRole?: { role: string; points: number } | null;
  playstyle?: PlaystyleFamily;
  specialAbilities?: string[];
  /** Conditional overlays. Base values stay in `stats`. */
  boosts?: Record<string, StatBoost>;
  /** Abstention channel. Never undefined; empty means a clean read. */
  review: ReviewFlag[];
}

const BOOST_TOKEN_RE = /^\+(\d{1,3})$/;

function toGlyphToken(e: OcrElement): GlyphToken | null {
  const text = e.text.trim();
  if (!text || !e.frame) return null;
  return {
    text,
    frame: {
      left: e.frame.left ?? 0,
      top: e.frame.top ?? 0,
      width: e.frame.width ?? 0,
      height: e.frame.height ?? 0,
    },
  };
}

/**
 * Stat rows carrying both a base number and a `+N` token. Detection is textual
 * (ML Kit reads both); only the active/inactive decision needs pixels.
 */
function findBoostCandidates(tokens: GlyphToken[]): BoostCandidate[] {
  const out: BoostCandidate[] = [];
  for (const tok of tokens) {
    const upper = OCR_STAT_CORRECTIONS[tok.text.toUpperCase()] ?? tok.text.toUpperCase();
    if (!ALL_STATS.has(upper as never)) continue;
    const row = tokens
      .filter(t => t !== tok && Math.abs(t.frame.top - tok.frame.top) < Y_TOL_VAL && t.frame.left > tok.frame.left)
      .sort((a, b) => a.frame.left - b.frame.left);
    const baseIdx = row.findIndex(t => /^\d{1,3}$/.test(t.text));
    if (baseIdx < 0) continue;
    const baseTok = row[baseIdx];
    // The +N must be the very next token on the row and sit hard against the base
    // value. Stat rows from all three columns share a baseline, so without an
    // adjacency guard a neighbouring column's boost is attributed to this stat.
    const boostTok = row[baseIdx + 1];
    if (!boostTok || !BOOST_TOKEN_RE.test(boostTok.text)) continue;
    const gap = boostTok.frame.left - (baseTok.frame.left + baseTok.frame.width);
    if (gap < 0 || gap > baseTok.frame.height * 1.5) continue;
    const m = BOOST_TOKEN_RE.exec(boostTok.text);
    if (!m) continue;
    out.push({
      stat: upper,
      amount: parseInt(m[1], 10),
      baseBox: baseTok.frame,
      boostBox: boostTok.frame,
    });
  }
  return out;
}

function findOvrBox(tokens: GlyphToken[]): GlyphToken['frame'] | undefined {
  const label = tokens.find(t => /^ovr$/i.test(t.text));
  if (!label) return undefined;
  const num = tokens
    .filter(t => Math.abs(t.frame.top - label.frame.top) < Y_TOL_VAL * 2 && t.frame.left > label.frame.left)
    .filter(t => /^\d{2,3}$/.test(t.text))
    .sort((a, b) => a.frame.left - b.frame.left)[0];
  return num?.frame ?? label.frame;
}

/**
 * Full scan: the frozen text pass, plus the glyph readers when a decoded image
 * is available.
 *
 * With no image the glyph readers cannot observe anything, so every glyph-backed
 * field abstains with `region_unread` and the legacy `roles` list is left exactly
 * as the text pass produced it. That is deliberate: dropping to `[]` / `none` /
 * `T0` because we never looked is the precise failure mode the spec forbids.
 */
export function parsePlayerCard(result: OcrResult, image?: RgbaImage | null): PlayerCardScanExtended {
  const base = parsePlayerCardText(result);

  const tokens: GlyphToken[] = (result.blocks ?? [])
    .flatMap(b => b.lines)
    .flatMap(l => l.elements)
    .map(toGlyphToken)
    .filter((t): t is GlyphToken => t !== null);

  const nameBlock = findNameBlock(result);
  const ctx: GlyphContext = {
    tokens,
    knownRoles: KNOWN_ROLES,
    nameBox: nameBlock?.frame,
    ovrBox: findOvrBox(tokens),
    boostCandidates: findBoostCandidates(tokens),
  };

  const glyph = readGlyphs(image ?? null, ctx);
  const review: ReviewFlag[] = [...glyph.review];

  // Tier: the NAME still comes from the text pass. The banner observation only
  // decides whether "no tier name" means T0 or means we never looked.
  let tier = base.tier;
  if (tier !== undefined) {
    // Tier was read from text — the banner-region flag is moot.
    for (let i = review.length - 1; i >= 0; i--) {
      if (review[i].field === 'tier' && review[i].reason === 'region_unread') review.splice(i, 1);
    }
  } else if (glyph.tierRegionObserved) {
    tier = 'T0';
  }

  // roles stays populated for backward compatibility (spec §4). It becomes the
  // established set once the chips were actually read; otherwise it keeps the
  // legacy text-derived value rather than collapsing to [].
  const roles = glyph.establishedRoles ?? base.roles;

  return {
    ...base,
    tier,
    roles,
    establishedRoles: glyph.establishedRoles,
    learningRole: glyph.learningRole,
    playstyle: glyph.playstyle,
    specialAbilities: glyph.specialAbilities,
    boosts: glyph.boosts,
    review,
  };
}
