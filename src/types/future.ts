/**
 * EXTENSION SEAMS — type definitions only.
 *
 * Nothing in this file is implemented, imported, or wired into the engine. It
 * records the SHAPES a later pass can adopt so that pass does not have to
 * rediscover them. Per the OCR/state-model spec §8 and constraint #5, the
 * engine (src/engine/*, profiles/*, ovrProjector.ts, xpEngine.ts) and the
 * projection path are quarantined: this pass changes no engine return type and
 * makes nothing consume these types.
 *
 * If you are about to import from this file, you are starting the next pass —
 * which means the seam has to be designed, not just adopted.
 */

// ---------------------------------------------------------------------------
// §8.1 Deterministic vs probabilistic outputs
//
// Training and tiering stay deterministic. Mentors and prize draws are
// distributions, so their results are bounded ranges, never asserted points.
// ---------------------------------------------------------------------------

export type Projection =
  | { kind: 'deterministic'; value: number }
  | { kind: 'range'; low: number; high: number; p?: number };

// ---------------------------------------------------------------------------
// §8.2 Mentors
//
// A mentor grants flat attribute deltas (deterministic) plus a percentage
// tactical effect whose base is undocumented. The opponent can change their
// preset, so the tactical part is observed and bounded, never asserted —
// hence `base: 'unknown'` and a Projection of kind 'range'.
// ---------------------------------------------------------------------------

export interface Mentor {
  flatBoosts: Record<string, number>;
  tacticalEffect?: { effect: string; pctLabel: number; base: 'unknown' };
}

// ---------------------------------------------------------------------------
// §8.3 Events / economy
//
// Fixed, repeating monthly structure: Draw Frenzy levels with free/paid prices,
// subscription pack contents, and publicly published prize odds. Modelled as
// data tables plus a per-feature "touch map" naming the subsystems a feature
// affects. Published odds feed the §8.1 ranges directly.
// ---------------------------------------------------------------------------

export interface DrawLevel {
  level: number;
  freeEntries: number;
  paidPrice?: number;
  /** Published odds, keyed by prize id. Feeds Projection 'range'. */
  odds: Record<string, number>;
}

export interface EventDefinition {
  id: string;
  cadence: 'monthly' | 'seasonal' | 'oneOff';
  levels: DrawLevel[];
  /** Subsystems this event touches, e.g. ['training', 'condition', 'economy']. */
  touchMap: string[];
}

// ---------------------------------------------------------------------------
// §8.4 Trophy Trials
//
// The one with real coupling worth capturing early: rest cost is a step
// function of fixtures played, and those rests compete with the training
// pipeline for the same currency. The eventual output is "placement X costs
// ~R rests at probability p, versus what those R rests buy in training".
//
// NOTE: the step boundaries below are the spec's provisional figures
// (3 rests for the first 3 games, 6 for the next 10, 9 thereafter). They MUST
// be confirmed against live data before anything is built on them.
// ---------------------------------------------------------------------------

export interface RestCostStep {
  /** Inclusive lower bound, in fixtures played. */
  fromFixture: number;
  restsPerFixture: number;
}

export interface TrophyTrialTarget {
  placement: number;
  fixturesRequired: number;
  /** Total rest cost, derived from the step function. */
  totalRests: Projection;
  /** Probability of reaching the placement, from published or observed data. */
  probability?: number;
}
