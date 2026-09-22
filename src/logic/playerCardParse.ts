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
import { splitRoleToken } from './roleTokenParse';
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
 * A player identity can never be a stat label or a stat/value OCR block.
 * ML Kit may return either:
 *   "Tackling"
 *   "Tackling 9"
 *   "Rushing Out"
 *   "Rushing Out 142"
 *
 * Use the canonical stat ontology rather than maintaining another blocklist.
 */
function looksLikeStatBlock(text: string): boolean {
  const upper = text.trim().toUpperCase();

  return [...ALL_STATS].some(stat => {
    const label = stat.toUpperCase();
    return (
      upper === label ||
      upper.startsWith(`${label} `) ||
      upper.startsWith(`${label}:`)
    );
  });
}

/**
 * Selects the player-name block: the topmost title-case block that is not a
 * known UI label. Hoisted out of parsePlayerCardText unchanged so the glyph
 * pass can anchor on the same block the text pass named.
 */
export function findNameBlock(result: OcrResult): OcrBlock | undefined {
  /*
   * Real-device contract:
   *
   *   "40 Ryan Rodger"        <- ML Kit header block
   *      ["40","Ryan","Rodger"]
   *   "OVR 89"                <- identity anchor below
   *
   * Resolve the player name from OCR ELEMENTS inside the header block.
   * A leading numeric shirt number is not part of the identity.
   */

  const blocks = result.blocks.filter(b => b.frame);

  const ovrAnchor = blocks.find(b =>
    /\bOVR\b/i.test(b.text.trim())
  );

  const ageAnchor = blocks.find(b =>
    /^Age\s*[:.]?\s*\d{2}\b/i.test(b.text.trim()) ||
    /^Age\s*[:.]?$/i.test(b.text.trim())
  );

  const anchor = ovrAnchor ?? ageAnchor;
  if (!anchor?.frame) return undefined;

  const candidates: Array<{ block: OcrBlock; gap: number }> = [];

  function nameFromBlock(block: OcrBlock): string {
    const elements = block.lines
      .flatMap(line => line.elements)
      .map(element => element.text.trim())
      .filter(Boolean);
    return (elements.length ? elements.join(' ') : block.text)
      .trim()
      // ML Kit can emit the shirt number separately ("40 Ryan") or fuse it
      // to the first name ("40Ryan"). Candidate geometry has already limited
      // this normalization to the identity header immediately above OVR/Age.
      .replace(/^\d{1,3}(?:\s+|(?=[A-Za-zÀ-ÖØ-öø-ÿ'’]))/, '')
      .trim();
  }

  for (const block of blocks) {
    if (!block.frame || block === anchor) continue;

    const bottom = block.frame.top + block.frame.height;
    const gap = anchor.frame.top - bottom;

    // Real Ryan evidence: header bottom=128, OVR top=163, gap=35.
    // Keep this deliberately local to the identity header.
    const maxGap = ovrAnchor ? 120 : 180;
    if (gap < 0 || gap > maxGap) continue;

    const blockRight = block.frame.left + block.frame.width;
    const anchorRight = anchor.frame.left + anchor.frame.width;

    const overlap =
      Math.min(blockRight, anchorRight) -
      Math.max(block.frame.left, anchor.frame.left);

    const leftDelta = Math.abs(block.frame.left - anchor.frame.left);

    // Ryan:
    //   header x=606..960
    //   OVR    x=692..784
    if (overlap <= 0 && leftDelta > 180) continue;

    const name = nameFromBlock(block);

    if (!validNameText(name)) continue;

    candidates.push({
      gap,
      block: {
        ...block,
        // Downstream parsing sees the semantic identity, not "40 Ryan Rodger".
        text: name,
      },
    });
  }

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => a.gap - b.gap);
  const primary = candidates[0].block;
  const row = blocks
    .filter(block => {
      if (block === anchor || block.frame!.top + block.frame!.height > anchor.frame!.top) return false;
      const a = primary.frame!;
      const b = block.frame!;
      const centerGap = Math.abs((a.top + a.height / 2) - (b.top + b.height / 2));
      return centerGap <= Math.max(a.height, b.height) * 0.5 && validNameText(nameFromBlock(block));
    })
    .map(block => ({ ...block, text: nameFromBlock(block) }))
    .sort((a, b) => a.frame!.left - b.frame!.left);
  const index = row.findIndex(block => block.frame === primary.frame);
  let first = index;
  let last = index;
  // ML Kit can put adjacent words of the same header in separate blocks. Join
  // only contiguous boxes on the same visual line; a distant label or another
  // line must never become part of the saved identity.
  while (first > 0 &&
    row[first].frame!.left - (row[first - 1].frame!.left + row[first - 1].frame!.width)
      <= Math.max(row[first].frame!.height, row[first - 1].frame!.height) &&
    row[first - 1].frame!.left + row[first - 1].frame!.width <= row[first].frame!.left) first--;
  while (last + 1 < row.length &&
    row[last + 1].frame!.left - (row[last].frame!.left + row[last].frame!.width)
      <= Math.max(row[last].frame!.height, row[last + 1].frame!.height) &&
    row[last].frame!.left + row[last].frame!.width <= row[last + 1].frame!.left) last++;
  const joined = row.slice(first, last + 1).map(item => item.text).join(' ');
  return {
    ...primary,
    text: validNameText(joined) ? joined : primary.text,
    frame: {
      ...primary.frame!,
      left: row[first].frame!.left,
      width: row[last].frame!.left + row[last].frame!.width - row[first].frame!.left,
    },
  };
}

function validNameText(name: string): boolean {
  if (name.length < 2 || name.length > 48 || /[\d:+]/.test(name)) return false;
  const words = name.split(/\s+/);
  if (words.length > 4 || !/^[A-Za-zÀ-ÖØ-öø-ÿ'’. -]+$/.test(name)) return false;
  const upper = name.toUpperCase();
  if (KNOWN_ROLES.includes(upper) || KNOWN_TIERS.some(t => t.toUpperCase() === upper) ||
    looksLikeStatBlock(name)) return false;
  const lower = name.toLowerCase();
  return !UI_BLOCKLIST.some(kw => {
    const label = kw.toLowerCase();
    return kw.includes(' ') ? lower.includes(label)
      : lower === label || lower.startsWith(`${label}:`) ||
        lower.startsWith(`${label}.`) || lower.startsWith(`${label} `);
  });
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
      if (p) {
        splitRoleToken(p, KNOWN_ROLES).forEach(r => foundRoles.add(r));
      }
    });
  }

  // fullText fallback — only when no "Roles:" anchor found.
  // Splits on non-alpha chars and applies greedy role parser to each segment so
  // concatenated tokens like "DMCMC" (no word boundary) are correctly parsed.
  if (roleRowY == null) {
    fullText.toUpperCase().split(/[^A-Z]+/).forEach(segment => {
      if (!segment) return;
      splitRoleToken(segment, KNOWN_ROLES).forEach(r => foundRoles.add(r));
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

/**
 * Structured OCR observation of the Roles row.
 *
 * The role labels and the X/50 progress counter are text, not glyph state. A
 * complete anchored row is therefore sufficient to recover established vs
 * learning roles even when screenshot pixel decoding/classification abstains.
 * This restores OCR role intake without reviving the old unsafe flat-role
 * behaviour: a progress counter is associated with the nearest role to its
 * left, and that role is explicitly excluded from establishedRoles.
 */
export interface StructuredTextRoleState {
  establishedRoles: string[];
  learningRole: { role: string; points: number } | null;
}

const ROLE_PROGRESS_RE = /(\d{1,2})\s*\/\s*50/;

export function parseStructuredRoleState(result: OcrResult): StructuredTextRoleState | undefined {
  // ML Kit can wrap one visual Roles row into multiple OCR lines inside the same
  // block. Treat the whole anchored block as the observation; reading only the
  // first line silently drops wrapped roles (the regression caught exactly that).
  const roleBlock = (result.blocks ?? []).find(block =>
    (block.lines ?? []).some(candidate =>
      candidate.elements?.some(element => /^roles?\s*:?$/i.test(element.text.trim())) ||
      /^roles?\s*:/i.test(candidate.text.trim())
    )
  );
  if (!roleBlock) return undefined;

  const elements = (roleBlock.lines ?? [])
    .flatMap(line => line.elements ?? [])
    .filter(element => element.frame && element.text.trim())
    .sort((a, b) => {
      const atop = a.frame?.top ?? 0;
      const btop = b.frame?.top ?? 0;
      if (atop !== btop) return atop - btop;
      return (a.frame?.left ?? 0) - (b.frame?.left ?? 0);
    });

  const roleAnchor = elements.find(element => /^roles?\s*:?$/i.test(element.text.trim()))
    ?? elements.find(element => /^roles?\s*:/i.test(element.text.trim()));
  if (!roleAnchor?.frame) return undefined;

  type LocatedRole = { role: string; left: number; right: number; top: number; height: number };
  const located: LocatedRole[] = [];

  // ML Kit is free to split the visually adjacent X/50 badge into a separate
  // OCR block. Collect counter observations globally, but do NOT classify one
  // as role progress merely because it shares the row. A role-progress counter
  // must also be geometrically adjacent to a recognised role chip.
  type LocatedCounter = { points: number; left: number; top: number; height: number };
  const allElements = (result.blocks ?? [])
    .flatMap(block => block.lines ?? [])
    .flatMap(line => line.elements ?? [])
    .filter(element => element.frame && element.text.trim());

  const rawCounters: LocatedCounter[] = allElements.flatMap(element => {
    const frame = element.frame!;
    const raw = element.text.trim();
    const match = ROLE_PROGRESS_RE.exec(raw);
    if (!match) return [];
    return [{
      points: parseInt(match[1], 10),
      // A single ML Kit element can contain "MC 8/50" (or the entire Roles:
      // row). Its frame starts at MC, not at the counter.
      left: frame.left + frame.width * (match.index / raw.length),
      top: frame.top,
      height: frame.height,
    }];
  });

  // Some OCR builds omit a dedicated counter element while retaining X/50 in
  // the line text. Estimate the counter's horizontal position from its character
  // offset inside the framed line; using line.frame.left directly would point to
  // the Roles: label and make the fallback unusable.
  if (rawCounters.length === 0) {
    for (const line of (result.blocks ?? []).flatMap(block => block.lines ?? [])) {
      if (!line.frame) continue;
      const match = ROLE_PROGRESS_RE.exec(line.text);
      if (!match || match.index == null) continue;
      const textLength = Math.max(line.text.length, 1);
      rawCounters.push({
        points: parseInt(match[1], 10),
        left: line.frame.left + line.frame.width * (match.index / textLength),
        top: line.frame.top,
        height: line.frame.height,
      });
    }
  }

  for (const element of elements) {
    if (!element.frame) continue;
    let frame = element.frame;
    let raw = element.text.trim();

    if (/^roles?\s*:?$/i.test(raw)) continue;
    const prefix = /^roles?\s*:\s*/i.exec(raw);
    if (prefix) {
      const fraction = prefix[0].length / raw.length;
      frame = { ...frame, left: frame.left + frame.width * fraction,
        width: frame.width * (1 - fraction) };
      raw = raw.slice(prefix[0].length);
    }

    const segments = raw.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
    const roles = segments.flatMap(segment => splitRoleToken(segment, KNOWN_ROLES));
    if (roles.length === 0) continue;

    const totalChars = roles.reduce((sum, role) => sum + role.length, 0);
    const counter = ROLE_PROGRESS_RE.exec(raw);
    const roleWidth = counter && counter.index > 0
      ? frame.width * (counter.index / raw.length)
      : frame.width;
    let consumed = 0;
    for (const role of roles) {
      const start = consumed / totalChars;
      const width = role.length / totalChars;
      consumed += role.length;
      located.push({
        role,
        left: frame.left + roleWidth * start,
        right: frame.left + roleWidth * (start + width),
        top: frame.top,
        height: frame.height,
      });
    }
  }

  const unique: LocatedRole[] = [];
  const seen = new Set<string>();
  for (const item of located.sort((a, b) => a.top - b.top || a.left - b.left)) {
    if (seen.has(item.role)) continue;
    seen.add(item.role);
    unique.push(item);
  }
  if (unique.length === 0) return undefined;

  // Pair only genuinely adjacent counters with a role. This is intentionally
  // stronger than "same row": unrelated X/50 UI elsewhere on the card must not
  // turn an established role into a learning role or force the entire role state
  // into review.
  const paired = rawCounters.flatMap(counter => {
    if (counter.points < 0 || counter.points >= 50) return [];
    const candidates = unique
      .filter(item => {
        const h = Math.max(item.height, counter.height);
        const sameRow = Math.abs(item.top - counter.top) <= h * 1.5;
        const gap = counter.left - item.right;
        return sameRow && gap >= -h * 0.5 && gap <= h * 3;
      })
      .sort((a, b) => b.right - a.right);
    const role = candidates[0];
    return role ? [{ counter, role }] : [];
  });

  // De-duplicate the same OCR observation emitted in overlapping blocks.
  const distinct = paired.filter((entry, index, all) =>
    all.findIndex(other =>
      other.counter.points === entry.counter.points &&
      other.role.role === entry.role.role &&
      Math.abs(other.counter.left - entry.counter.left) <= Math.max(other.counter.height, entry.counter.height) &&
      Math.abs(other.counter.top - entry.counter.top) <= Math.max(other.counter.height, entry.counter.height)
    ) === index
  );

  if (distinct.length > 1) return undefined;
  // OCR letters do not encode chip colour. If the X/50 badge is unread,
  // the rightmost black learning chip looks exactly like an established label.
  // Only a matched progress badge can certify the text-only role state.
  if (distinct.length === 0) return undefined;

  let learningRole: { role: string; points: number } | null = null;
  if (distinct.length === 1) {
    learningRole = {
      role: distinct[0].role.role,
      points: distinct[0].counter.points,
    };
  }

  const establishedRoles = unique
    .map(item => item.role)
    .filter(role => role !== learningRole?.role);

  // Every player has at least one established role. If OCR cannot establish
  // that much, abstain rather than manufacture an empty observation.
  if (establishedRoles.length === 0) return undefined;

  return { establishedRoles, learningRole };
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
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const upper = OCR_STAT_CORRECTIONS[tok.text.toUpperCase()] ?? tok.text.toUpperCase();
    // Two-word GK stats (RUSHING OUT, AERIAL REACH) arrive as two elements, the
    // same way the frozen text pass sees them. Without this they are structurally
    // unreachable, so a boost on them could never be observed.
    let stat = ALL_STATS.has(upper as never) ? upper : '';
    if (!stat && i + 1 < tokens.length) {
      const next = tokens[i + 1];
      const twoWord = `${upper} ${next.text.toUpperCase()}`;
      if (ALL_STATS.has(twoWord as never) && Math.abs(next.frame.top - tok.frame.top) < Y_TOL) {
        stat = twoWord;
      }
    }
    if (!stat) continue;
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
      stat,
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
 * With no image, pixel-only fields abstain. Roles are the exception when the
 * anchored OCR Roles row is structurally complete: its labels plus X/50 counter
 * can resolve established-vs-learning state without colour classification.
 * Unstructured role text still abstains rather than being promoted.
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

  let establishedRoles = glyph.establishedRoles;
  let learningRole = glyph.learningRole;

  // The OCR Roles row is itself structured evidence. The labels are explicit,
  // and an X/50 counter identifies the learning role by adjacency. This lets
  // role intake survive pixel decode/classification failures without treating
  // the old flat text-role list as established truth.
  let textRoleState = parseStructuredRoleState(result);
  if (textRoleState && base.newRole && base.roles?.includes(base.newRole)) {
    const established = textRoleState.establishedRoles.filter(role => role !== base.newRole);
    if (established.length > 0) {
      textRoleState = {
        establishedRoles: established,
        learningRole: { role: base.newRole, points: base.newRolePoints ?? 0 },
      };
    }
  }

  const isRoleFlag = (flag: ReviewFlag) =>
    flag.field === 'roles' ||
    flag.field.startsWith('roles.') ||
    flag.field === 'learningRole';

  const roleFlags = review.filter(isRoleFlag);

  const glyphAgreesWhereReadable =
    (establishedRoles ?? []).every(role =>
      role === textRoleState?.learningRole?.role || textRoleState?.establishedRoles.includes(role)) &&
    (!learningRole || (learningRole.role === textRoleState?.learningRole?.role &&
      learningRole.points === textRoleState.learningRole.points));
  const pixelsAreUnclear = roleFlags.length > 0 && roleFlags.every(flag =>
    flag.reason === 'chip_state_unclear' || flag.reason === 'region_unread');
  const completeGlyphRoleLabels = establishedRoles !== undefined &&
    textRoleState?.establishedRoles.every(role => establishedRoles?.includes(role));

  if (textRoleState && glyphAgreesWhereReadable &&
      (!image || pixelsAreUnclear || (roleFlags.length === 0 && completeGlyphRoleLabels))) {
    // A paired, adjacent X/50 badge identifies the learning role even when a
    // pixel sample exists but its chip state is unreadable or looks established.
    // The counter is positive learning evidence; chip brightness is not proof
    // of completion. Other contradictory role labels or progress still abstain.
    establishedRoles = [...textRoleState.establishedRoles];
    learningRole = textRoleState.learningRole
      ? { ...textRoleState.learningRole }
      : null;
    for (let i = review.length - 1; i >= 0; i--) {
      if (isRoleFlag(review[i])) review.splice(i, 1);
    }
  } else if (textRoleState && establishedRoles !== undefined && roleFlags.length === 0) {
    // Compare semantic role state, not array ordering. The text pass and glyph
    // pass may enumerate the same roles in different orders, while the OCR block
    // preserves the left-to-right card order for downstream provenance.
    const glyphEstablished = new Set(establishedRoles);
    const textEstablished = new Set(textRoleState.establishedRoles);
    const missingFromGlyph = textRoleState.establishedRoles.filter(role => !glyphEstablished.has(role));
    const extraInGlyph = establishedRoles.filter(role => !textEstablished.has(role));

    const sameEstablished =
      missingFromGlyph.length === 0 &&
      extraInGlyph.length === 0;

    const sameLearning =
      (learningRole?.role ?? null) === (textRoleState.learningRole?.role ?? null) &&
      (learningRole?.points ?? 0) === (textRoleState.learningRole?.points ?? 0);

    if (!sameEstablished || !sameLearning) {
      const detail: string[] = [];
      if (missingFromGlyph.length > 0) {
        detail.push('text role candidate(s) not accounted for by glyph read: ' + missingFromGlyph.join(', '));
      }
      if (extraInGlyph.length > 0) {
        detail.push('glyph-only role candidate(s): ' + extraInGlyph.join(', '));
      }
      if (!sameLearning) {
        detail.push(
          'learning role differs: glyph=' +
          (learningRole ? learningRole.role + ' ' + learningRole.points + '/50' : 'none') +
          ', text=' +
          (textRoleState.learningRole
            ? textRoleState.learningRole.role + ' ' + textRoleState.learningRole.points + '/50'
            : 'none')
        );
      }

      review.push({
        field: 'roles',
        reason: 'low_confidence',
        detail: detail.join('; '),
      });
      establishedRoles = undefined;
      learningRole = undefined;
    }
  }

  // A confident glyph read still has to account for every text role candidate.
  // This catches a partial pixel read when the OCR row itself was not structured
  // enough to resolve established-vs-learning state.
  const roleAlreadyFlagged = review.some(isRoleFlag);
  if (
    establishedRoles !== undefined &&
    !roleAlreadyFlagged &&
    !textRoleState &&
    base.roles?.length
  ) {
    const accounted = new Set(establishedRoles);
    if (learningRole) accounted.add(learningRole.role);

    const missing = base.roles.filter(role => !accounted.has(role));

    if (missing.length > 0) {
      review.push({
        field: 'roles',
        reason: 'low_confidence',
        detail: 'text role candidate(s) not accounted for by glyph read: ' + missing.join(', '),
      });

      establishedRoles = undefined;
      learningRole = undefined;
    }
  }

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
  // resolved established set after either a structured OCR row or a confident
  // glyph read; otherwise it keeps the legacy flat text candidates for review.
  const roles = establishedRoles ?? base.roles;

  return {
    ...base,
    tier,
    roles,
    establishedRoles,
    learningRole,
    playstyle: glyph.playstyle,
    specialAbilities: glyph.specialAbilities,
    boosts: glyph.boosts,
    review,
  };
}
