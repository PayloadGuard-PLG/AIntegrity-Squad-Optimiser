/**
 * outcomeEvidence — the layer where an observed outcome is allowed to matter.
 *
 * The pipeline is one-directional:
 *
 *     pre-outcome state ──> prediction          (recommendation.ts)
 *     observed outcome  ──> constrain / falsify (here)
 *
 * A prediction is derived from the calibrated mathematics and nothing else. The
 * observation exists to TEST that prediction, so it can never be an ingredient
 * of it: a quantity used to produce an answer cannot also check it, and
 * agreement obtained that way is guaranteed rather than earned (Prop. XXV).
 *
 * `projectCoachAction` therefore neither accepts nor returns observed intervals.
 * They arrive here instead, and a comparison is a SEPARATE result that callers
 * join to the projection for display. Varying the observation changes what this
 * module says; it must never change what the projection says.
 */

import type { CoachPreviewInterval, CoachTransferClass } from './recommendation';

/**
 * Observed intervals admitted as evidence.
 *
 * The same filter the production abstention used to apply, moved here with the
 * evidence it belongs to. A negative low bound or an inverted range is a failed
 * read, not an observation of a negative gain.
 */
export function buildOutcomeEvidence(
  observed: CoachPreviewInterval[] | undefined,
): CoachPreviewInterval[] {
  return (observed ?? [])
    .filter(i => i.gainLo >= 0 && i.gainHi >= i.gainLo)
    .map(i => ({ ...i }));
}

export type StatVerdict =
  /** The predicted gain falls inside the observed interval. */
  | { stat: string; verdict: 'consistent'; predicted: number; gainLo: number; gainHi: number }
  /** It falls outside. The model is wrong here, or a mechanic is missing. */
  | { stat: string; verdict: 'contradicted'; predicted: number; gainLo: number; gainHi: number }
  /** No prediction exists to test — an abstaining class, or an unpredicted stat. */
  | { stat: string; verdict: 'untestable'; gainLo: number; gainHi: number };

export interface FalsificationResult {
  transferClass: CoachTransferClass;
  /** Empty when nothing was observed. Absence of evidence is not a verdict. */
  verdicts: StatVerdict[];
  /** True when at least one stat contradicts. One counterexample is enough. */
  contradicted: boolean;
}

/** The prediction side of the comparison — only what a verdict needs. */
export interface PredictedDelta { stat: string; delta: number }

/**
 * Tests a prediction against what was later observed.
 *
 * Membership of the interval, at both ends, with no midpoint anywhere: the game
 * never said where inside the range the expectation sits, so "closeness to the
 * centre" is not a quantity this comparison has (Prop. XXIV). A prediction is
 * consistent if it lies within [lo, hi] and contradicted otherwise.
 *
 * An abstaining class yields `untestable` for every observation rather than a
 * pass. Nothing was predicted, so nothing survived a test.
 */
export function compareObservedAgainstPrediction(
  predicted: PredictedDelta[] | null,
  observed: CoachPreviewInterval[] | undefined,
  transferClass: CoachTransferClass,
): FalsificationResult {
  const evidence = buildOutcomeEvidence(observed);
  const verdicts: StatVerdict[] = evidence.map(o => {
    const p = predicted?.find(d => d.stat === o.stat);
    if (!p) {
      return { stat: o.stat, verdict: 'untestable', gainLo: o.gainLo, gainHi: o.gainHi };
    }
    const inside = p.delta >= o.gainLo && p.delta <= o.gainHi;
    return {
      stat: o.stat,
      verdict: inside ? 'consistent' : 'contradicted',
      predicted: p.delta,
      gainLo: o.gainLo,
      gainHi: o.gainHi,
    };
  });
  return {
    transferClass,
    verdicts,
    contradicted: verdicts.some(v => v.verdict === 'contradicted'),
  };
}
