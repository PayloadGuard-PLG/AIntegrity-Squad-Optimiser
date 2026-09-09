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
import type { TierName } from '../types/resources';
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

/**
 * How a run's quality change was arrived at — and note the shapes differ.
 *
 * A projection produces a post-action OVR, because the model computed the whole
 * resulting stat set. An OBSERVATION does not: the coach preview displays a
 * BOOST RANGE, and never a post-action OVR. Storing `ovrBefore + boost` as
 * though the sum had been observed launders one quantity into a different one
 * that the game never showed — the addition is a computation, and a computation
 * cannot confer observed status on its result (Prop. XXII).
 *
 * So the observed variant carries the boost itself, under its own field names,
 * and no post-action OVR exists anywhere on it to be mistaken for a reading.
 */
export type RunOutcome =
  | { kind: 'projected'; ovrAfter: number }
  | { kind: 'observed-boost-interval'; ovrBoostLo: number; ovrBoostHi: number }
  | { kind: 'legacy-unknown'; ovrAfter: number }
  | { kind: 'none-observed' };

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
  ovrBoostLo?: unknown;
  ovrBoostHi?: unknown;
}): RunOutcome {
  if (row?.gainEvidence === 'observed-interval') {
    // An observed run reports the observed BOOST, or nothing. It never reports a
    // post-action OVR: the preview did not display one, and `ovr_after` on such
    // a row is a NOT NULL storage filler, not a reading. This branch returns
    // before that column can be reached.
    if (typeof row.ovrBoostLo === 'number' && typeof row.ovrBoostHi === 'number') {
      return { kind: 'observed-boost-interval', ovrBoostLo: row.ovrBoostLo, ovrBoostHi: row.ovrBoostHi };
    }
    return { kind: 'none-observed' };
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

/*
 * runEvidenceKind (removed) — it graded a whole run by inspecting its gains,
 * and its only caller was squadPlanService.saveRun, which used it to INFER the
 * write grade from the array. That inference is exactly what the discriminated
 * SaveRunInput now forbids: provenance is declared by the caller and constrains
 * the gain type at the same moment, so an array and a grade can no longer
 * disagree. Reading back is unaffected — a stored row reports the grade in its
 * own gain_evidence column.
 *
 * Do not reintroduce it. A helper that derives a grade from gains is an
 * invitation to re-derive the write grade after the caller has crossed the
 * boundary, which is the defect this replaced.
 */

/** Fields every newly-written run carries, whatever its provenance. */
interface SaveRunCommon {
  sessions: number;
  selectedStats: string[];
  ovrBefore: number;
  tier?: TierName | null;
  label?: string | null;
}

/**
 * The write contract, discriminated by provenance.
 *
 * The grade is no longer INFERRED from the gains after the caller has crossed
 * this boundary — it is declared, and declaring it constrains the gain type and
 * the quality fields simultaneously. Previously `gains: StatGain[]` sat beside
 * optional `ovrAfter` and `ovrBoostLo/Hi` in one object and saveRun read the
 * grade back off the array, so a caller could pass observed gains with a
 * computed `ovrAfter`, or mix kinds in one array, and the type system had no
 * opinion. The two live callers happened to behave; the shapes were still
 * representable, and a representable wrong state is a defect waiting for a
 * third caller.
 *
 * `legacy-unknown` is deliberately absent. It is a READ state — what a row
 * written before the grades existed reports itself as — and nothing may newly
 * assume it.
 */
export type SaveRunInput =
  | (SaveRunCommon & {
      kind: 'projected';
      /** Engine output: one number per stat, because the model produced one. */
      gains: ProjectedStatGain[];
      /** The model computed a whole resulting stat set, so a post-OVR exists. */
      ovrAfter: number;
      /** A projection observed nothing. There is no API here to claim it did. */
      ovrBoostLo?: never;
      ovrBoostHi?: never;
    })
  | (SaveRunCommon & {
      kind: 'observed-interval';
      /**
       * No post-action OVR exists to supply. The preview displays a boost and
       * never a result, so an observed caller has no API by which to provide
       * one — and the NOT NULL compatibility filler is derived inside saveRun,
       * where a caller cannot reach it.
       */
      ovrAfter?: never;
    } & (
      /*
       * An observed row must CONTAIN an observation. The previous shape let
       * `gains: []` sit beside no boost, producing a row graded observed that
       * held nothing observed — a provenance claim with no referent, and the
       * worst kind of calibration record because it looks like evidence.
       *
       * Two legitimate shapes, and nothing else:
       */
      // 1. At least one observed stat interval. The OVR boost is optional, and
      //    paired when present — half an interval is not an interval.
      | ({ gains: [ObservedStatGain, ...ObservedStatGain[]] } & (
          | { ovrBoostLo: number; ovrBoostHi: number }
          | { ovrBoostLo?: never; ovrBoostHi?: never }
        ))
      // 2. OVR-ONLY evidence: a preview may show a boost range while no stat row
      //    reads cleanly. That is still an observation, and refusing to
      //    represent it would push a caller to invent a stat gain to carry it.
      //    Both bounds required — an OVR-only row with half a range holds
      //    nothing complete.
      | { gains: ObservedStatGain[]; ovrBoostLo: number; ovrBoostHi: number }
    ));

/**
 * Maps a capture decision onto the write shape it entitles.
 *
 * This exists so the mapping can be EXECUTED by a test. A source-shape
 * assertion can show that a branch is written; it cannot show that an input
 * reaches it — a mutation that returns early before the OVR-only save leaves
 * every grepped token in place and still drops the write. That mutation
 * survived until this function existed.
 *
 * It also gives the screen exactly one saveRun call, so there is no longer a
 * branch there to drop.
 */
export function buildObservedSaveRun(
  decision: Exclude<ObservedRunDecision, { outcome: 'reject' }>,
  common: Omit<SaveRunCommon, never>,
): SaveRunInput {
  if (decision.outcome === 'ovr-only') {
    return {
      kind: 'observed-interval', ...common,
      gains: [],
      ovrBoostLo: decision.boost.ovrBoostLo,
      ovrBoostHi: decision.boost.ovrBoostHi,
    };
  }
  if (decision.boost) {
    return {
      kind: 'observed-interval', ...common,
      gains: decision.gains,
      ovrBoostLo: decision.boost.ovrBoostLo,
      ovrBoostHi: decision.boost.ovrBoostHi,
    };
  }
  return { kind: 'observed-interval', ...common, gains: decision.gains };
}

/** A complete observed OVR boost. Both bounds or it is not one. */
export interface ObservedBoost {
  ovrBoostLo: number;
  ovrBoostHi: number;
}

/**
 * Which observed-write shape a capture holds, or that it holds none.
 *
 * The storage type admits two forms of observed evidence — stat intervals, or a
 * complete OVR boost standing alone — and the capture screen previously
 * returned on the first check, so the OVR-only form was representable but
 * unreachable from the only writer. A shape nothing can produce is not a
 * supported case; it is dead surface pretending to be one.
 *
 * The decision lives here, pure, because "zero gains plus a complete boost
 * reaches saveRun" is a claim about BEHAVIOUR. Asserting it by grepping the
 * screen's source would only show that the branch is written, not that the
 * inputs route to it.
 */
export type ObservedRunDecision =
  /** No evidence of either kind. Nothing is written. */
  | { outcome: 'reject' }
  /** At least one stat interval; a complete boost travels with it when present. */
  | { outcome: 'stat-intervals'; gains: [ObservedStatGain, ...ObservedStatGain[]]; boost: ObservedBoost | null }
  /** No stat interval read, but the preview's own OVR boost was. */
  | { outcome: 'ovr-only'; boost: ObservedBoost };

export function decideObservedRun(
  gains: ObservedStatGain[],
  ovrBoostLo: number | null | undefined,
  ovrBoostHi: number | null | undefined,
): ObservedRunDecision {
  // A boost is a PAIR, and an INTERVAL — the same validity observedStatGain
  // already applies to a stat range, applied here because a boost range is the
  // same kind of object read by the same OCR:
  //
  //   - both ends finite; half a pair is a failed read, not a partial
  //     observation, and cannot rescue an empty gain set;
  //   - hi >= lo, so a degenerate 0–0 survives (Neri's age-32 preview is an
  //     observation of a zero-width range, not a failure to read);
  //   - an INVERTED pair such as +8–6 is failed evidence. It is not reordered:
  //     the scanner does not guarantee ordering, so lo > hi means the read went
  //     wrong, and swapping the ends would manufacture an observation out of a
  //     misread rather than discard one.
  const boost: ObservedBoost | null =
    typeof ovrBoostLo === 'number' && Number.isFinite(ovrBoostLo) &&
    typeof ovrBoostHi === 'number' && Number.isFinite(ovrBoostHi) &&
    ovrBoostHi >= ovrBoostLo
      ? { ovrBoostLo, ovrBoostHi }
      : null;

  // Destructured, not length-checked: the non-empty tuple the storage type
  // requires follows from this narrowing, so the caller can satisfy the
  // invariant rather than assert it with a cast.
  const [first, ...rest] = gains;
  if (first) return { outcome: 'stat-intervals', gains: [first, ...rest], boost };
  if (boost) return { outcome: 'ovr-only', boost };
  return { outcome: 'reject' };
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

/**
 * The same, for a run's quality change.
 *
 * The observed case needs no arithmetic at all — the boost interval IS the
 * change, exactly as the game displayed it. Only the computed and the
 * unattributable cases subtract, because only they hold a post-action figure.
 */
export function formatOvrDelta(outcome: RunOutcome, ovrBefore: number): GainDisplay {
  switch (outcome.kind) {
    case 'observed-boost-interval':
      return {
        text: `+${trim(outcome.ovrBoostLo)}–${trim(outcome.ovrBoostHi)}`,
        grade: 'observed-interval',
      };
    case 'none-observed':
      return { text: 'NOT OBSERVED', grade: 'observed-interval' };
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
