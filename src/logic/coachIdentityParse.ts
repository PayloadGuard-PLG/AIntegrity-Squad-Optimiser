/**
 * coachIdentityParse — the pure, React-Native-free half of the coach-preview scanner.
 *
 * `coachScanner.ts` imports `@react-native-ml-kit/text-recognition`, which pulls in
 * `react-native` and therefore cannot be loaded by Node. The identity resolvers live
 * here for the same reason `playerCardParse.ts` exists: so they can be exercised
 * directly by tests without the native module.
 *
 * IMPORTANT — what these observations are ABOUT.
 * A coach preview renders whichever player card the GAME has attached to the coach.
 * That is not necessarily the player selected in the app. Everything resolved here is
 * an observation about the image; it is never, on its own, an assertion about the
 * selected player. Callers are responsible for that distinction.
 */

import { OUTFIELD_STATS, GK_STATS } from '../utils/roleWeights';

const ALL_STATS = new Set([...OUTFIELD_STATS, ...GK_STATS]);

/** Arrow OCR candidates seen on highlighted rows when no player is selected. */
export const ARROW_RE = /[↑\^›>▲]/;

export const TALENT_OPTIONS = ['FT1', 'FT2', 'FT3', 'Normal', 'Slow'] as const;
export type TalentOption = typeof TALENT_OPTIONS[number];

/** Minimal ML Kit block shape the resolvers need. */
export interface NameBlock {
  text: string;
  frame?: { top?: number } | null;
}

/**
 * UI strings that share the name's title-case shape. Matched as substrings
 * because OCR merges a label with its neighbour ("Reward Coach", "Training Camp").
 */
const NAME_BLOCKLIST = [
  'Standard', 'Focused', 'Extensive', 'Attacking', 'Defending', 'Physical',
  'Safeguard', 'Goalkeeping', 'Select', 'Training', 'Session', 'Start',
  'Reward', 'Coach', 'Camp', 'Round', 'Boost', 'Condition', 'Player',
  'Level', 'Team', 'Talent', 'Rate', 'Age', 'Skill', 'Attribute',
];

/**
 * The player name shown on a coach preview, or undefined when none is identifiable.
 *
 * The predicate this replaces took the FIRST block in document order matching
 * "capital-then-lowercase, length >= 3, not all digits, not in a short blocklist".
 * Every stat name passes that — Tackling, Marking, Passing — and on a coach preview
 * the stat rows usually precede the card, so it returned rows such as
 * "Tackling 157 +5-7" as the player's name in 3 of 4 realistic block orderings.
 *
 * Three corrections: reject any block containing a stat name; reject any block
 * carrying a digit (a name has none, a stat row always does); and take the TOPMOST
 * survivor by frame.top rather than document order — the same resolution
 * playerCardParse.findNameBlock uses for the identical problem.
 */
export function resolvePlayerName(blocks: NameBlock[]): string | undefined {
  const best = (blocks ?? [])
    .filter(b => {
      const t = (b?.text ?? '').trim();
      const upper = t.toUpperCase();
      return (
        t.length >= 3 &&
        /^[A-Z][a-z]/.test(t) &&
        !/\d/.test(t) &&
        !ARROW_RE.test(t) &&
        ![...ALL_STATS].some(st => upper.includes(st)) &&
        !NAME_BLOCKLIST.some(w => upper.includes(w.toUpperCase())) &&
        !TALENT_OPTIONS.some(o => upper === o.toUpperCase())
      );
    })
    .reduce<{ text: string; top: number } | undefined>((acc, b) => {
      const cand = {
        text: (b?.text ?? '').trim(),
        top: b?.frame?.top ?? Number.MAX_SAFE_INTEGER,
      };
      return !acc || cand.top < acc.top ? cand : acc;
    }, undefined);
  return best?.text;
}

/**
 * The talent tier shown on a coach preview, or undefined.
 *
 * Taken only from a block that IS the value, or one carrying an explicit label.
 * The pattern this replaces searched the whole OCR text for
 * /\b(FT1|FT2|FT3|Normal|Slow)\b/ — and "Normal" is an ordinary English word, so any
 * incidental occurrence in UI copy became a talent reading.
 *
 * NOTE: a tier read here is NOT confirmation. Project policy holds that only the
 * Personal Trainer tab confirms talent, and every projection applies Normal (1.0)
 * regardless of what is stored. Callers must not present this as card-confirmed.
 */
export function resolveTalentTier(blocks: NameBlock[]): string | undefined {
  const TALENT_MAP: Record<string, string> = { FT1: 'Fastest', FT2: 'Fast', FT3: 'Average' };
  const raw = (blocks ?? [])
    .map(b => (b?.text ?? '').trim())
    .map(t => {
      const bare = TALENT_OPTIONS.find(o => t.toLowerCase() === o.toLowerCase());
      if (bare) return bare;
      const m = /^(?:Training\s*Rate|Talent)\s*:?\s*(FT1|FT2|FT3|Normal|Slow)$/i.exec(t);
      return m ? TALENT_OPTIONS.find(o => o.toLowerCase() === m[1].toLowerCase()) : undefined;
    })
    .find((v): v is TalentOption => v !== undefined);
  return raw ? (TALENT_MAP[raw] ?? raw) : undefined;
}

/**
 * The player age shown on a coach preview, or undefined.
 * Unchanged behaviour, hoisted out of scanCoachPreview so it is reachable by tests.
 */
export function resolvePlayerAge(fullText: string): number | undefined {
  const m = /\bAge\s*:?\s*(\d{2})\b/i.exec(fullText ?? '');
  return m ? parseInt(m[1], 10) : undefined;
}

// ---------------------------------------------------------------------------
// Identity ingestion
// ---------------------------------------------------------------------------

/** The identity fields a coach preview can observe. Every one is optional. */
export interface ScannedIdentity {
  name?: string;
  age?: number;
  talent?: string;
}

/**
 * Merges a scan's identity observations over whatever is already held.
 *
 * The whole contract is in the guards: a field is written ONLY when this scan
 * actually observed it. An absent observation leaves the prior value alone — it
 * does not clear it and it does not acquire a default. That is what keeps a
 * partial re-scan from erasing a good earlier read or a manual correction.
 */
export function ingestScannedIdentity(
  observed: ScannedIdentity,
  prev: ScannedIdentity = {},
): ScannedIdentity {
  const next: ScannedIdentity = { ...prev };
  if (observed?.name !== undefined && observed.name !== '') next.name = observed.name;
  if (observed?.age !== undefined && Number.isFinite(observed.age)) next.age = observed.age;
  if (observed?.talent !== undefined && observed.talent !== '') next.talent = observed.talent;
  return next;
}

export interface IdentityMismatch {
  field: 'name' | 'age' | 'talent';
  observed: string;
  selected: string;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Fields where the scanned card disagrees with the player selected in the app.
 *
 * This matters beyond cosmetics. A coach preview renders the card the GAME has
 * attached to that coach, so when the identity disagrees the stat intervals read
 * from the same image describe the other player too — and the projection is
 * running against the selected player's record. The disagreement is the signal
 * that the two are not the same observation.
 *
 * Only fields present on BOTH sides are compared: an unobserved field is not
 * evidence of disagreement.
 */
export function identityMismatches(
  observed: ScannedIdentity,
  selected: { name?: string; age?: number; talent?: string } | null | undefined,
): IdentityMismatch[] {
  if (!selected) return [];
  const out: IdentityMismatch[] = [];
  if (observed?.name && selected.name && norm(observed.name) !== norm(selected.name)) {
    out.push({ field: 'name', observed: observed.name, selected: selected.name });
  }
  if (observed?.age !== undefined && selected.age !== undefined && observed.age !== selected.age) {
    out.push({ field: 'age', observed: String(observed.age), selected: String(selected.age) });
  }
  if (observed?.talent && selected.talent && norm(observed.talent) !== norm(selected.talent)) {
    out.push({ field: 'talent', observed: observed.talent, selected: selected.talent });
  }
  return out;
}
