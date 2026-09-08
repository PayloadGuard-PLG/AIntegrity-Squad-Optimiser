/**
 * runEvidence — what a saved training run actually recorded, and how strongly.
 *
 * A saved run mixes two things that were never the same kind of quantity:
 *
 *   - the ENGINE's projection, which is one number because the model produced
 *     one number; and
 *   - the GAME's displayed `+lo-hi` preview, which is an interval because the
 *     game stated an interval and has never said where inside it the
 *     expectation sits.
 *
 * The capture screen used to store the second as `(lo + hi) / 2`, into the very
 * record the engine constants are back-calculated from. That is Principia
 * Prop. XXIV: a midpoint manufactures a precision the observation does not
 * contain, and averaging several of them compounds it, because it hides how wide
 * each one was. The sound method is to keep `lo` and `hi` apart, solve at both
 * bounds, and intersect.
 *
 * This module is deliberately free of the database and of react-native so the
 * rules can be tested directly.
 */

/** The engine produced a single number. One number is recorded. */
export interface ProjectedStatGain {
  kind: 'projected';
  stat: string;
  from: number;
  gain: number;
  isWhite: boolean;
}

/** The game displayed `+lo-hi`. Both bounds are kept; no midpoint is formed. */
export interface ObservedStatGain {
  kind: 'observed-interval';
  stat: string;
  from: number;
  gainLo: number;
  gainHi: number;
  isWhite: boolean;
}

/**
 * A row written before the kinds existed. Its `gain` may be an engine
 * projection or a midpoint laundered out of an interval — nothing on the row
 * distinguishes them, because the distinction was destroyed at the moment of
 * writing. It is reported as neither.
 */
export interface LegacyStatGain {
  kind: 'legacy-unknown';
  stat: string;
  from: number;
  /**
   * Deliberately NOT named `gain`.
   *
   * ProjectedStatGain and this interface were otherwise structurally identical,
   * so `if (g.kind !== 'observed-interval') use g.gain` compiled and silently
   * consumed unattributable rows as though they were engine output — the grade
   * was documentation, not a condition. Under a distinct name that expression no
   * longer type-checks, and a consumer must narrow to a specific kind and mean
   * it.
   */
  unattributableGain: number;
  isWhite: boolean;
}

export type StatGain = ProjectedStatGain | ObservedStatGain | LegacyStatGain;

/** How a run's post-action quality was arrived at. Same three grades. */
export type RunOutcome =
  | { kind: 'projected'; ovrAfter: number }
  | { kind: 'observed-interval'; ovrAfterLo: number; ovrAfterHi: number }
  | { kind: 'legacy-unknown'; ovrAfter: number };

export type EvidenceKind = StatGain['kind'];

/** Rows as they come back from SQLite: `kind` may be absent or anything. */
type RawGain = Record<string, unknown>;

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Reads one stored gain back into its evidence kind.
 *
 * The load-bearing clause is the last one. A row carrying no `kind` is
 * `legacy-unknown` and never `projected`: promoting it would assert that its
 * scalar came from the engine, which for every capture-screen row written
 * before this change is exactly the false claim the midpoint made. Same offence
 * in a different coat, per Prop. XX's scholium on back-filled columns.
 */
export function normaliseStatGain(raw: RawGain): StatGain {
  const stat = String(raw?.stat ?? '');
  const from = num(raw?.from);
  const isWhite = raw?.isWhite === true;

  if (raw?.kind === 'observed-interval'
      && typeof raw.gainLo === 'number' && typeof raw.gainHi === 'number') {
    return { kind: 'observed-interval', stat, from, isWhite,
             gainLo: raw.gainLo, gainHi: raw.gainHi };
  }
  if (raw?.kind === 'projected') {
    return { kind: 'projected', stat, from, isWhite, gain: num(raw.gain) };
  }
  return { kind: 'legacy-unknown', stat, from, isWhite, unattributableGain: num(raw?.gain) };
}

/** Reads a run's stored quality columns back into its outcome kind. */
export function normaliseRunOutcome(row: {
  gainEvidence?: unknown;
  ovrAfter?: unknown;
  ovrAfterLo?: unknown;
  ovrAfterHi?: unknown;
}): RunOutcome {
  if (row?.gainEvidence === 'observed-interval'
      && typeof row.ovrAfterLo === 'number' && typeof row.ovrAfterHi === 'number') {
    return { kind: 'observed-interval', ovrAfterLo: row.ovrAfterLo, ovrAfterHi: row.ovrAfterHi };
  }
  if (row?.gainEvidence === 'projected') {
    return { kind: 'projected', ovrAfter: num(row.ovrAfter) };
  }
  return { kind: 'legacy-unknown', ovrAfter: num(row?.ovrAfter) };
}

/**
 * Builds an observed gain from a coach preview WITHOUT forming a midpoint.
 *
 * The absence of arithmetic here is the point: `lo` and `hi` are carried
 * through untouched. If either bound was not read, the observation is
 * incomplete and nothing is recorded for that attribute — an interval with one
 * end missing is not an interval.
 */
export function observedStatGain(
  stat: string, from: number, gainLo: number | undefined, gainHi: number | undefined,
  isWhite: boolean,
): ObservedStatGain | undefined {
  if (gainLo === undefined || gainHi === undefined) return undefined;
  if (!Number.isFinite(gainLo) || !Number.isFinite(gainHi)) return undefined;
  if (gainHi < gainLo) return undefined;
  return { kind: 'observed-interval', stat, from, gainLo, gainHi, isWhite };
}

/** The evidence grade a whole run carries: the weakest of its parts. */
export function runEvidenceKind(gains: StatGain[]): EvidenceKind {
  if (gains.some(g => g.kind === 'legacy-unknown')) return 'legacy-unknown';
  if (gains.some(g => g.kind === 'observed-interval')) return 'observed-interval';
  return 'projected';
}

export interface GainDisplay {
  /** What to show. An interval renders as an interval. */
  text: string;
  /** Whether the figure is a model output, a measurement, or unattributable. */
  grade: EvidenceKind;
}

/**
 * The single formatter for a stored gain. Routing every display through here is
 * what keeps a midpoint from reappearing in the UI after being kept out of the
 * record — there is no branch in this function that averages two bounds.
 */
export function formatGain(g: StatGain): GainDisplay {
  switch (g.kind) {
    case 'observed-interval':
      return { text: `+${trim(g.gainLo)}–${trim(g.gainHi)}`, grade: g.kind };
    case 'projected':
      return { text: `+${trim(g.gain)}`, grade: g.kind };
    case 'legacy-unknown':
      return { text: `+${trim(g.unattributableGain)}`, grade: g.kind };
  }
}

/** The same, for a run's quality change. */
export function formatOvrDelta(outcome: RunOutcome, ovrBefore: number): GainDisplay {
  switch (outcome.kind) {
    case 'observed-interval':
      return {
        text: `+${trim(outcome.ovrAfterLo - ovrBefore)}–${trim(outcome.ovrAfterHi - ovrBefore)}`,
        grade: outcome.kind,
      };
    case 'projected':
    case 'legacy-unknown': {
      const d = outcome.ovrAfter - ovrBefore;
      return { text: `${d > 0 ? '+' : ''}${trim(d)}`, grade: outcome.kind };
    }
  }
}

/**
 * THE ELIGIBILITY CONDITION for model derivation, calibration and falsification.
 *
 * Only a directly observed interval may constrain or falsify the transfer model.
 *
 *   - `projected` is the model's own output. Feeding it back in would calibrate
 *     the model against itself, and any agreement so obtained is guaranteed
 *     rather than earned — Prop. XXV's fault with the two artefacts collapsed
 *     into one.
 *   - `legacy-unknown` cannot be attributed to either origin, so it cannot
 *     discharge the role of either.
 *
 * This is a type guard, so passing the gate is what gives a caller access to
 * `gainLo`/`gainHi` at all. A calibration path cannot read the bounds without
 * first proving the row is entitled to be there.
 */
export function calibrationEligible(g: StatGain): g is ObservedStatGain {
  return g.kind === 'observed-interval';
}

/** The subset of a run's gains admissible as calibration evidence. */
export function calibrationEvidence(gains: StatGain[]): ObservedStatGain[] {
  return gains.filter(calibrationEligible);
}

/** Short label for the grade, shown beside any figure that is not a projection. */
export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  'projected': 'PROJECTED',
  'observed-interval': 'OBSERVED RANGE',
  'legacy-unknown': 'UNATTRIBUTED',
};

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
