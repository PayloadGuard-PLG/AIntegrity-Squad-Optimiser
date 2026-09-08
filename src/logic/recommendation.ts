/**
 * recommendation.ts — the single domain seam for "what will this action do?".
 *
 * This module composes existing, proven machinery. It implements no mathematics
 * of its own:
 *
 *   gains        → ordinary Academy: engineMath.coachBudgetPerStat; drills:
 *                  drillBudgetPerStat; unresolved Reward Coaches abstain; then
 *                  statGainFromBudget + combinedMultiplier, stepped across star
 *                  thresholds by runTraining below
 *   OVR          → engineMath.paddedStatSum / exactOvrFromSum
 *   training lock→ engineMath.baseOvrFromTotal + isTrainingLocked
 *   condition    → conditionEngine.sessionDrain (a RANGE, never a scalar)
 *   whiteness    → roleWeights.isWhiteStat / getWhiteStatKeys
 *
 * It exists so Drills, Coaches, Results and ovrProjector consume one answer
 * instead of four. ovrProjector.applyDrillSessionsToStats is a CONSUMER of this
 * module, not a parallel implementation — the drill loop lives here now.
 *
 * Epistemic rules this module enforces:
 *   - condition is a range with its own confidence, never collapsed here;
 *   - the charged cost of N cycles is NOT a modelled quantity, so the range is
 *     published per cycle and never multiplied out;
 *   - talent policy is resolved once, in resolveTalentPolicy, never by a screen;
 *   - a training-locked player is projected as no gain, not as gain-plus-a-warning;
 *   - "no condition mechanic for this action" is stated, not encoded as zero;
 *   - star-threshold decay is applied as the projection crosses thresholds, not
 *     sampled once at the start (see runTraining);
 *   - stat values stay fractional throughout. Progress below the displayed
 *     integer is real internal state and a small gain can carry a player over a
 *     threshold, so nothing is rounded until presentation.
 *   - Reward Coach preview intervals are observations, not inputs to the
 *     ordinary Academy transfer; until calibrated they produce no numeric gain.
 */

import {
  coachBudgetPerStat, drillBudgetPerStat, statGainFromBudget, combinedMultiplier,
  starBandIndex, tierOvrContribExact, paddedStatSum, exactOvrFromSum, baseOvrFromTotal,
  isTrainingLocked,
} from '../engine/engineMath';
import { STAR_OVR_THRESHOLD, TOTAL_ATTRS } from '../engine/engineConstants';
import { isWhiteStat, getWhiteStatKeys } from '../utils/roleWeights';
import { sessionDrain, SessionDrain } from '../utils/conditionEngine';
import { DRILL_LIST } from '../database/drillDatabase';
import { Player } from '../database/playerSchema';
import { GameProfile, TalentTier, SurgeState, SURGE_STATE_SEASON_START } from '../types/resources';

// ── Evidence grading ─────────────────────────────────────────────────────────
// A consumer must be able to tell a calibrated fact from an assumption without
// reading CLAUDE.md. See the calibration table there for what earns each grade.
export type EvidenceGrade = 'calibrated' | 'assumed' | 'observed-envelope' | 'unavailable';

export interface RecommendationReason {
  code: string;
  detail: string;
  evidence: EvidenceGrade;
}

export interface StatDelta {
  stat: string;
  from: number;
  delta: number;
  isWhite: boolean;
}

/**
 * Which talent multiplier the projection actually used, and why.
 *
 * CLAUDE.md: only Normal (1.0) is confirmed. Every other tier is a community
 * estimate that produces incorrect predictions, and Slow (0.47) was invalidated
 * in Sprint 34 as an artefact of the linear budget model. A tier is confirmed
 * only from the Personal Trainer tab PLUS a back-calculated coaching result —
 * neither of which the player record currently represents, so `source` is always
 * the default policy today. This field is the seam where that changes.
 */
export interface TalentPolicy {
  applied: TalentTier;
  stored: TalentTier;
  source: 'normal-default-policy' | 'confirmed-observation';
}

export type ResourceKind = 'coachSessions' | 'drillCycles';

export interface ResourceRequirement {
  kind: ResourceKind;
  amount: number;
  label: string;
}

export type RecommendedAction =
  | { kind: 'coach'; label: string; stats: string[]; sessions: number }
  | { kind: 'drill'; label: string; drillNames: string[]; cycles: number };

/**
 * Condition basis. `not-applicable` is a positive statement that this action has
 * no modelled condition mechanic — it is NOT an unobserved cost silently set to
 * zero. `per-cycle` means the range describes ONE cycle: the charged cost of N
 * cycles has never been observed, so this module refuses to synthesise it.
 */
export type ConditionBasis = 'per-cycle' | 'not-applicable';

/**
 * Star-band position at the start of an action.
 *
 * `positionEvidence` is the honest part. Training progress below the displayed
 * integer is real internal state, but a card scan only ever shows integers, so
 * the true position inside the band is usually NOT observable. When it is not,
 * `ovrToNextThreshold` is an UPPER bound: the real crossing may come sooner.
 * It is never silently reported as a known figure, and the missing fraction is
 * never assumed to be .0.
 */
export interface StarBandPosition {
  /** Absolute band index of base (star-quality) OVR. */
  index: number;
  /** Base OVR remaining before the next threshold, from the values we hold. */
  ovrToNextThreshold: number;
  /**
   * How well the ABSOLUTE position in the band is known.
   *  - 'lower-bound' — every attribute was read, but the sub-integer progress
   *    behind those integers is not displayed by the game, so the threshold may
   *    arrive sooner than `ovrToNextThreshold` says. This is the normal case.
   *  - 'unknown'     — some attributes were never read and were padded with the
   *    player's overall. The position is then a function of invented values and
   *    is not a bound in EITHER direction.
   *  - 'exact'       — reserved for a source that has genuinely observed the
   *    fraction. Nothing does today; see positionEvidenceOf.
   */
  positionEvidence: 'exact' | 'lower-bound' | 'unknown';
}

export interface RecommendationResult {
  projectionStatus: 'projected';
  action: RecommendedAction;
  statDeltas: StatDelta[];
  projectedStats: Record<string, number>;
  /** Floored — matches the integer the game displays. */
  ovrBefore: number;
  /** Unfloored, 1dp — fractional progress is real internal state. */
  ovrAfterExact: number;
  /** Floored view of the same projection, for consumers showing game-style OVR. */
  ovrAfterFloored: number;
  /** ovrAfterExact − ovrBefore. */
  ovrDelta: number;
  /** Where the player sits in the absolute star-band structure at the start of
   *  this action, and how far the next difficulty threshold is. */
  starBand: StarBandPosition;
  condition: SessionDrain | null;
  conditionBasis: ConditionBasis;
  resources: ResourceRequirement[];
  talent: TalentPolicy;
  trainingLocked: boolean;
  reasons: RecommendationReason[];
}

/**
 * Coach classes have different empirical contracts.
 *
 * `ordinary` is the Academy transfer function calibrated by the existing
 * geometric XP-budget evidence. `reward` is a scan classification, not an XP
 * multiplier: matched Reward Coach previews falsify the ordinary transfer
 * function, and no replacement function is calibrated yet.
 *
 * `unknown` is the third honest state: the entry predates coach classification,
 * so nothing ever observed which kind it was. It is NOT a synonym for ordinary.
 * Reward Coaches wear the Standard/Extensive label, so an unclassified history
 * row is genuinely indistinguishable from an ordinary one, and projecting it as
 * ordinary would fabricate exactly the numbers this seam refuses to fabricate
 * for a freshly scanned Reward Coach. It abstains instead.
 */
export type CoachTransferClass = 'ordinary' | 'reward' | 'unknown';

/**
 * One interval printed by the game's coach preview. Never a midpoint.
 *
 * `statBefore` is OPTIONAL because it is a SEPARATE observation from the
 * interval. The scanner finds the baseline by a nearest-number search that
 * returns nothing when the row's own value lands in a different OCR block —
 * routine in the game's three-column layout. A row can therefore yield a
 * perfectly good `+lo–hi` with no baseline beside it.
 *
 * Requiring the baseline made an observed interval unrepresentable without it,
 * so a missing measurement of one quantity destroyed a successful measurement
 * of another. The interval is the evidence; the baseline is context for
 * displaying it.
 */
export interface CoachPreviewInterval {
  stat: string;
  /** Present only when the baseline was actually read. Never inferred. */
  statBefore?: number;
  gainLo: number;
  gainHi: number;
}

/**
 * Honest Reward Coach result while its transfer function is unresolved.
 * Deliberately contains no projected stats or post-action OVR: unchanged values
 * would be indistinguishable from a prediction of zero gain.
 */
export interface UnresolvedCoachProjection {
  projectionStatus: 'unavailable';
  action: Extract<RecommendedAction, { kind: 'coach' }>;
  /** 'reward' — classified, but its transfer function is uncalibrated.
   *  'unknown' — never classified, so no transfer function can be selected. */
  transferClass: 'reward' | 'unknown';
  observedGainIntervals: CoachPreviewInterval[];
  ovrBefore: number;
  condition: null;
  conditionBasis: 'not-applicable';
  resources: ResourceRequirement[];
  reasons: RecommendationReason[];
}

export type CoachProjectionResult = RecommendationResult | UnresolvedCoachProjection;

/**
 * THE talent decision. Every projection in the app resolves talent here.
 *
 * Note that a stored 'Unknown' also lands on Normal — but by policy, not by the
 * accident of `talentMultipliers` lacking an 'Unknown' key. Unknown is not
 * Normal; it is unknown, and the policy says to project it at Normal.
 */
export function resolveTalentPolicy(player: Pick<Player, 'talent'>): TalentPolicy {
  const stored = (player.talent ?? 'Unknown') as TalentTier;
  return { applied: 'Normal', stored, source: 'normal-default-policy' };
}

function talentReasons(policy: TalentPolicy): RecommendationReason[] {
  const out: RecommendationReason[] = [{
    code: 'talent.policy',
    detail: 'Projected at Normal (×1.0) — the only confirmed training rate.',
    evidence: 'calibrated',
  }];
  if (policy.stored !== 'Normal') {
    out.push({
      code: 'talent.substituted',
      detail: `Card shows ${policy.stored}; that tier is not calibrated, so it was not used.`,
      evidence: 'unavailable',
    });
  }
  return out;
}

/**
 * Is the player's ABSOLUTE position inside the star band actually known?
 *
 * It is not, and running a projection does not make it so.
 *
 * A player card shows integer attributes. The sub-integer training progress
 * behind them is never displayed, so every projection starts from an unknown
 * fraction and adds a gain it computed. Writing that as
 *
 *     true position = (s + ε) + g        ε ∈ [0,1) per attribute, unobserved
 *     our estimate  =  s      + g
 *
 * the error is still exactly ε. Adding a known quantity to an unknown baseline
 * leaves the uncertainty precisely where it was: it neither grows nor cancels.
 *
 * This function previously returned 'exact' whenever any stat carried a decimal.
 * That was uncertainty laundering. The only thing a decimal establishes is that
 * OUR OWN model produced it — and a model-generated fraction is not an
 * observation. It made the guarantee strictly worse the longer a chain ran: the
 * first projection turned integers into decimals, and every later step then
 * called the accumulated, still-unknown-by-ε position 'exact'.
 *
 * `observedFraction` is the honest escape hatch: a caller that has genuinely
 * measured the fraction may declare it. Nothing in this codebase can, because
 * the game does not show it, so in practice the answer is always a bound.
 *
 * Padding is worse still. When attributes are missing, paddedStatSum substitutes
 * the player's overall for each unread one, and a position derived from invented
 * values is not a bound in either direction — the real player may sit on either
 * side of it. That case abstains with 'unknown'.
 */
function positionEvidenceOf(
  stats: Record<string, number>,
  observedFraction = false,
): StarBandPosition['positionEvidence'] {
  if (Object.keys(stats).length < TOTAL_ATTRS) return 'unknown';
  return observedFraction ? 'exact' : 'lower-bound';
}

function starReasons(band: StarBandPosition, starsCrossed: number): RecommendationReason[] {
  const out: RecommendationReason[] = [];
  if (starsCrossed > 0) {
    // 'assumed', not 'calibrated'. engineConstants records starDecayPerSession
    // = 0.85 as a model characteristic with empirical confirmation PENDING.
    // Observing that training gets harder after a star does not calibrate the
    // numerical factor — it only establishes the sign of the effect.
    out.push({
      code: 'training.starDecay',
      detail: `Projection crosses ${starsCrossed} star threshold${starsCrossed > 1 ? 's' : ''}; training past each one is charged at a reduced rate. The direction is observed; the 0.85 factor itself is an uncalibrated model characteristic.`,
      evidence: 'assumed',
    });
  }
  if (band.positionEvidence === 'lower-bound') {
    out.push({
      code: 'training.hiddenProgress',
      detail: `Sub-integer training progress is not visible on a player card, so the ${band.ovrToNextThreshold.toFixed(2)} base OVR shown to the next star threshold is an upper bound — the threshold may be reached sooner. Running a projection does not resolve this: the computed gain is added to the same unobserved starting fraction.`,
      evidence: 'unavailable',
    });
  }
  if (band.positionEvidence === 'unknown') {
    out.push({
      code: 'training.paddedPosition',
      detail: `Some attributes were never read and were padded with the player's overall, so this star-band position rests on invented values. It is not a bound in either direction — the player may sit on either side of the threshold. Scan the full attribute list to locate the band.`,
      evidence: 'unavailable',
    });
  }
  return out;
}

/** Band position for a training-locked player: reported, but no run happens.
 *  Takes the EXACT base OVR — a floored one would misreport the distance. */
function lockedBand(player: Player, exactBaseOvr: number): StarBandPosition {
  const index = starBandIndex(exactBaseOvr);
  return {
    index,
    ovrToNextThreshold: (index + 1) * STAR_OVR_THRESHOLD - exactBaseOvr,
    positionEvidence: positionEvidenceOf(player.stats),
  };
}

/** Shared lock evaluation. Base OVR = total − the tier's OVR contribution. */
function evaluateLock(player: Player, profile: GameProfile) {
  const sum = paddedStatSum(player.stats, player.overall);
  const totalOvr = sum === null ? player.overall : Math.floor(exactOvrFromSum(sum));
  const whiteCount = getWhiteStatKeys(player.role).length;
  // The lock compares the integer the game displays — floored contribution.
  const baseOvr = baseOvrFromTotal(totalOvr, player.tier, whiteCount);
  // Band position needs the fraction, so the contribution must NOT be floored.
  const exactBaseOvr = (sum === null ? player.overall : exactOvrFromSum(sum))
    - tierOvrContribExact(player.tier, whiteCount);
  void profile;
  return { totalOvr, baseOvr, exactBaseOvr, locked: isTrainingLocked(baseOvr) };
}

function ovrView(stats: Record<string, number>, knownOverall: number, ovrBefore: number) {
  const sum = paddedStatSum(stats, knownOverall);
  const exact = sum === null ? ovrBefore : Number(exactOvrFromSum(sum).toFixed(1));
  return {
    ovrAfterExact: exact,
    ovrAfterFloored: Math.floor(exact),
    ovrDelta: Number((exact - ovrBefore).toFixed(1)),
  };
}

function lockedResult(
  action: RecommendedAction,
  player: Player,
  ovrBefore: number,
  starBand: StarBandPosition,
  condition: SessionDrain | null,
  conditionBasis: ConditionBasis,
  resources: ResourceRequirement[],
  talent: TalentPolicy,
  baseOvr: number,
  maxBaseOvr: number,
): RecommendationResult {
  return {
    projectionStatus: 'projected',
    action,
    statDeltas: [],
    projectedStats: { ...player.stats },
    ovrBefore,
    ovrAfterExact: ovrBefore,
    ovrAfterFloored: Math.floor(ovrBefore),
    ovrDelta: 0,
    starBand,
    condition,
    conditionBasis,
    resources,
    talent,
    trainingLocked: true,
    reasons: [{
      code: 'training.locked',
      detail: `Base OVR ${baseOvr} has reached the training cap (${maxBaseOvr}). Training has no effect; tier upgrades still apply.`,
      evidence: 'calibrated',
    }],
  };
}

// ── Star-threshold training runner ───────────────────────────────────────────

/**
 * One unit of training: a stat, the XP budget aimed at it, and the drill-level
 * multiplier that applies. Coaching produces one slot per scanned stat; a drill
 * plan produces one slot per stat per drill.
 */
interface TrainingSlot {
  stat: string;
  budget: number;
  drillLevelMult: number;
  isWhite: boolean;
}

/** Bisection steps used to land exactly on a star threshold. Deterministic. */
const THRESHOLD_BISECTIONS = 60;
/** Guard against a pathological loop; each pass consumes at least one star. */
const MAX_STAR_SEGMENTS = 64;

/**
 * Applies the slots' budgets, re-evaluating star decay as the projection crosses
 * star-band boundaries.
 *
 * THRESHOLDS ARE ABSOLUTE. A band boundary sits at a fixed multiple of
 * STAR_OVR_THRESHOLD in the player's BASE OVR (star quality). A player already
 * 19.4 into a band crosses the next boundary after 0.6 OVR of progress, not
 * after a fresh 20 from wherever this projection began. Deriving the first
 * boundary from the start of the run — as an earlier version did — handed every
 * projection a free cheap band.
 *
 * Two different quantities, deliberately kept apart:
 *   BAND POSITION decides WHEN the next difficulty threshold is crossed, and is
 *   read from BASE OVR (total minus the tier's OVR contribution).
 *   STAT VALUES decide HOW EXPENSIVE each point is, and are the actual current
 *   values INCLUDING tier additions — a tier-inflated 400 stat is genuinely
 *   expensive. Tier is never stripped out of a cost input.
 *
 * `starDecayPerSession` and `sessionBudgetDecay` remain separate mechanics:
 * Sprint 34 established that geometric SESSION-BUDGET decay explains the ×20/×40
 * plateau, and said nothing about star decay, which makes training harder after
 * a threshold is crossed.
 *
 * The decay exponent counts boundaries crossed WITHIN this run and so starts at
 * zero; only the distance to the first boundary comes from the absolute position.
 *
 * The method is numerical, not a new formula: the budget is advanced at a fixed
 * band until the next boundary is reached, the band is incremented, and the
 * remainder continues at the harder rate. `statGainFromBudget` is monotonic in
 * budget, so the crossing point is found by bisection. Every multiplier and every
 * gain still comes from the verified engine primitives.
 *
 * OVR is tracked EXACTLY (unfloored) throughout: progress below the displayed
 * integer is real internal state, and a small gain can carry a player across a
 * boundary the floored value would hide.
 */
function runTraining(params: {
  slots: TrainingSlot[];
  baseStats: Record<string, number>;
  knownOverall: number;
  /** Subtracted from total OVR to get star-quality (base) OVR. MUST be the
   *  unfloored contribution (tierOvrContribExact): a floored one puts its
   *  residue straight into the fraction that decides the boundary. */
  tierOvrOffset: number;
  age: number;
  talent: TalentTier;
  statCap: number;
}): {
  projectedStats: Record<string, number>;
  deltas: Record<string, number>;
  starsCrossed: number;
  startBandIndex: number;
  ovrToNextThreshold: number;
} {
  const { slots, baseStats, knownOverall, tierOvrOffset, age, talent, statCap } = params;

  // Base (star-quality) OVR, exact. Tier contribution is an integer, so
  // subtracting it preserves the fractional part that decides a near crossing.
  const exactBaseOvr = (stats: Record<string, number>) => {
    const sum = paddedStatSum(stats, knownOverall);
    return (sum === null ? knownOverall : exactOvrFromSum(sum)) - tierOvrOffset;
  };
  const startOvr = exactBaseOvr(baseStats);
  const startBandIndex = starBandIndex(startOvr);
  const ovrToNextThreshold = (startBandIndex + 1) * STAR_OVR_THRESHOLD - startOvr;

  const projectedStats = { ...baseStats };
  const deltas: Record<string, number> = {};
  if (slots.length === 0) {
    return { projectedStats, deltas, starsCrossed: 0, startBandIndex, ovrToNextThreshold };
  }

  // Applies `fraction` of each slot's remaining budget to a scratch copy.
  const applyFraction = (from: Record<string, number>, remaining: number[], fraction: number, stars: number) => {
    const next = { ...from };
    slots.forEach((slot, i) => {
      const budget = remaining[i] * fraction;
      if (budget <= 0) return;
      // The ACTUAL current value, tier additions included: that is what the
      // cost curve is indexed on, and why a tiered 400 stat barely moves.
      const current = next[slot.stat];
      if (current === undefined || current >= statCap) return;
      const mult = combinedMultiplier({
        age, talent, isWhite: slot.isWhite, starsGained: stars,
        drillLevelMult: slot.drillLevelMult,
        // Match-form boosts are NOT a permanent-attribute mechanic — see the
        // note on CoachActionInput. Nothing here may pass one in.
        twoxAd: false,
      });
      next[slot.stat] = Math.min(current + statGainFromBudget(current, budget, mult), statCap);
    });
    return next;
  };

  const bandsCrossed = (stats: Record<string, number>) => starBandIndex(exactBaseOvr(stats)) - startBandIndex;

  let remaining = slots.map(s => s.budget);
  let current = projectedStats;
  // Boundaries crossed so far in THIS run — the decay exponent, which starts at
  // zero however far into a band the player already is.
  let stars = 0;

  for (let segment = 0; segment < MAX_STAR_SEGMENTS; segment++) {
    const full = applyFraction(current, remaining, 1, stars);
    if (bandsCrossed(full) <= stars) {
      current = full;                       // the rest of the run stays inside this band
      break;
    }
    // The run reaches a boundary. Advance to it, then charge the remainder at
    // the next band's rate. Bisection lands just below, so the band is carried
    // rather than re-derived — re-deriving would read the old band back and the
    // run would converge on the boundary without ever passing it.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < THRESHOLD_BISECTIONS; i++) {
      const mid = (lo + hi) / 2;
      if (bandsCrossed(applyFraction(current, remaining, mid, stars)) <= stars) lo = mid; else hi = mid;
    }
    current = applyFraction(current, remaining, lo, stars);
    remaining = remaining.map(b => b * (1 - lo));
    stars++;
  }

  for (const stat of new Set(slots.map(s => s.stat))) {
    const delta = (current[stat] ?? 0) - (baseStats[stat] ?? 0);
    if (delta > 0) deltas[stat] = delta;
  }
  return { projectedStats: current, deltas, starsCrossed: stars, startBandIndex, ovrToNextThreshold };
}

// ── Coach action ─────────────────────────────────────────────────────────────

export interface CoachActionInput {
  player: Player;
  /** Stats the scanner actually saw with gain ranges — never an assumed category. */
  stats: string[];
  sessions: number;
  profile: GameProfile;
  label?: string;
  /** Defaults to ordinary for legacy/manual entries. Scanner callers must pass it. */
  transferClass?: CoachTransferClass;
  /** Required evidence payload for Reward Coaches; ranges are observations. */
  observedGainIntervals?: CoachPreviewInterval[];
}

/**
 * The PRE-OUTCOME state, and the only thing a prediction may see.
 *
 * Everything here is knowable before the coach is applied: the player's card,
 * which attributes the coach affects, how many sessions, and the profile that
 * carries age, talent, whiteness and the cost curve. Nothing here is a result.
 *
 * The `never`-typed fields are the enforcement, not decoration. TypeScript
 * accepts a wider object where a narrower one is expected, so merely omitting
 * the observed fields would still let a caller hand the whole CoachActionInput
 * — evidence included — straight to the predictor. Typed `never`, an
 * `observedGainIntervals?: CoachPreviewInterval[]` is not assignable, so the
 * boundary is a compile error rather than a convention.
 */
export interface PreOutcomeCoachInput {
  player: Player;
  stats: string[];
  sessions: number;
  profile: GameProfile;
  label?: string;
  observedGainIntervals?: never;
  observedOvrBoostLo?: never;
  observedOvrBoostHi?: never;
  ovrAfterLo?: never;
  ovrAfterHi?: never;
}

/**
 * Coach projection boundary. Ordinary Academy budget comes from
 * engineMath.coachBudgetPerStat —
 * the geometric model confirmed in Sprint 34. The linear model is falsified; do
 * not reintroduce it.
 *
 * NO MATCH-FORM BOOST. The doubling item some squads carry (however acquired —
 * advert, sponsor reward, token purchase or a teamplay drill) is a MATCH-FORM /
 * teamplay effect. It is a different mechanic from the academy development
 * coaches this function projects, and it does not multiply permanent attributes,
 * permanent OVR, or academy coaching gain. It was previously fed into
 * combinedMultiplier's ad slot; that interpretation is falsified and removed.
 * Modelling the match-form subsystem is future work, not this function's job.
 */
export function projectCoachAction(
  input: CoachActionInput & { transferClass?: 'ordinary' },
): RecommendationResult;
export function projectCoachAction(
  input: CoachActionInput & { transferClass: 'reward' | 'unknown' },
): UnresolvedCoachProjection;
export function projectCoachAction(input: CoachActionInput): CoachProjectionResult;
export function projectCoachAction(input: CoachActionInput): CoachProjectionResult {
  const { player, stats, sessions, profile } = input;
  const transferClass = input.transferClass ?? 'ordinary';
  const action: RecommendedAction = {
    kind: 'coach',
    label: input.label ?? `Coach ×${sessions}`,
    stats: [...stats],
    sessions,
  };
  const resources: ResourceRequirement[] = [
    { kind: 'coachSessions', amount: sessions, label: `${sessions} coaching sessions` },
  ];
  if (transferClass === 'reward' || transferClass === 'unknown') {
    const observedGainIntervals = (input.observedGainIntervals ?? [])
      .filter(interval => interval.gainLo >= 0 && interval.gainHi >= interval.gainLo)
      .map(interval => ({ ...interval }));
    const reason: RecommendationReason = transferClass === 'unknown'
      ? {
          code: 'coach.transferClassUnknown',
          detail: 'This entry was recorded before coaches were classified, so it was never observed whether it was an ordinary Academy coach or a Reward Coach. Reward Coaches carry the same Standard/Extensive label, so the two cannot be told apart after the fact and the ordinary transfer function may not apply. Re-scan the coach to classify it.',
          evidence: 'unavailable',
        }
      : {
          code: 'coach.rewardTransferUnresolved',
          detail: observedGainIntervals.length > 0
            ? 'Reward Coach transfer is not calibrated. The scanned +lo–hi ranges are retained as observations; no XP, stat, or OVR prediction is fabricated.'
            : 'Reward Coach transfer is not calibrated and no usable +lo–hi interval was captured. No XP, stat, or OVR prediction is available.',
          evidence: 'unavailable',
        };
    return {
      projectionStatus: 'unavailable',
      action,
      transferClass,
      observedGainIntervals,
      ovrBefore: evaluateLock(player, profile).totalOvr,
      condition: null,
      conditionBasis: 'not-applicable',
      resources,
      reasons: [reason],
    };
  }

  // THE BOUNDARY. Only pre-outcome state crosses it. The fields are picked
  // explicitly rather than spread, so an observation added to CoachActionInput
  // later cannot arrive here by inheriting the spread — and PreOutcomeCoachInput
  // would reject it if it tried.
  return predictOrdinaryCoachAction({
    player, stats, sessions, profile, label: input.label,
  });
}

/**
 * The production prediction for an ordinary Academy coach.
 *
 * It derives the gain from the calibrated mathematics alone: the geometric
 * budget, the exponential cost curve, age, the Normal-talent policy, and
 * white/grey status. It has never seen an observed +lo–hi and cannot: the
 * observation exists to constrain or falsify this output, and a quantity used to
 * produce a prediction cannot also test it.
 *
 * Do not widen this signature to take observed evidence. If a Reward transfer is
 * ever identified, it becomes a different calibrated function reached through
 * projectCoachAction's routing — not an observation threaded into this one.
 */
function predictOrdinaryCoachAction(input: PreOutcomeCoachInput): RecommendationResult {
  const { player, stats, sessions, profile } = input;
  const action: RecommendedAction = {
    kind: 'coach',
    label: input.label ?? `Coach ×${sessions}`,
    stats: [...stats],
    sessions,
  };
  const resources: ResourceRequirement[] = [
    { kind: 'coachSessions', amount: sessions, label: `${sessions} coaching sessions` },
  ];

  const talent = resolveTalentPolicy(player);
  const { baseOvr, totalOvr, exactBaseOvr, locked } = evaluateLock(player, profile);
  const maxBaseOvr = profile.maxBaseOvr ?? 180;

  if (locked) {
    return lockedResult(action, player, totalOvr, lockedBand(player, exactBaseOvr), null, 'not-applicable', resources, talent, baseOvr, maxBaseOvr);
  }

  const statValues: Record<string, number> = {};
  const missing: string[] = [];
  for (const stat of stats) {
    const from = player.stats[stat];
    if (from === undefined) missing.push(stat); else statValues[stat] = from;
  }

  const whiteStats = new Set(stats.filter(s => isWhiteStat(player.role, s)));
  const budget = coachBudgetPerStat(sessions, Object.keys(statValues));
  const { projectedStats, deltas, starsCrossed, startBandIndex, ovrToNextThreshold } = runTraining({
    slots: Object.keys(statValues).map(stat => ({
      stat, budget, drillLevelMult: 1.0, isWhite: whiteStats.has(stat),
    })),
    baseStats: player.stats,
    knownOverall: player.overall,
    age: player.age,
    talent: talent.applied,
    statCap: profile.statCap,
    tierOvrOffset: tierOvrContribExact(player.tier, getWhiteStatKeys(player.role).length),
  });

  const starBand: StarBandPosition = {
    index: startBandIndex,
    ovrToNextThreshold,
    positionEvidence: positionEvidenceOf(player.stats),
  };

  const statDeltas: StatDelta[] = Object.entries(deltas)
    .map(([stat, delta]) => ({
      stat, from: statValues[stat], delta: Number(delta.toFixed(1)), isWhite: whiteStats.has(stat),
    }))
    .filter(d => d.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  const reasons = talentReasons(talent);
  reasons.push(...starReasons(starBand, starsCrossed));
  if (missing.length > 0) {
    reasons.push({
      code: 'stats.unread',
      detail: `No stored value for ${missing.join(', ')} — excluded rather than treated as zero.`,
      evidence: 'unavailable',
    });
  }

  return {
    projectionStatus: 'projected',
    action,
    statDeltas,
    projectedStats,
    ovrBefore: totalOvr,
    ...ovrView(projectedStats, player.overall, totalOvr),
    starBand,
    // Academy coaching has no modelled condition cost. Stated, not zeroed.
    condition: null,
    conditionBasis: 'not-applicable',
    resources,
    talent,
    trainingLocked: false,
    reasons,
  };
}

// ── Drill action ─────────────────────────────────────────────────────────────

export interface DrillActionInput {
  player: Player;
  drillNames: string[];
  cycles: number;
  profile: GameProfile;
  surge?: SurgeState;
  label?: string;
}

export function findDrill(drillName: string) {
  return DRILL_LIST.find(d => d.name.toLowerCase() === drillName.toLowerCase()) ?? null;
}

/**
 * Drill projection for `cycles` runs of `drillNames` together.
 *
 * The condition range describes ONE cycle. Multiplying it by `cycles` would
 * assert a multi-cycle charge distribution nobody has observed, so it is not
 * done here and must not be done by a consumer.
 */
export function projectDrillAction(input: DrillActionInput): RecommendationResult {
  const { player, drillNames, cycles, profile, surge = SURGE_STATE_SEASON_START } = input;
  const talent = resolveTalentPolicy(player);
  const drills = drillNames.map(findDrill).filter((d): d is NonNullable<ReturnType<typeof findDrill>> => d !== null);
  const action: RecommendedAction = {
    kind: 'drill',
    label: input.label ?? drillNames.join(' + '),
    drillNames: [...drillNames],
    cycles,
  };
  const resources: ResourceRequirement[] = [
    { kind: 'drillCycles', amount: cycles, label: `${cycles} drill cycles` },
  ];
  const condition = drills.length > 0
    ? sessionDrain(drills.map(d => ({ baseLoss: d.baseLoss, intensity: d.intensity })), surge)
    : null;
  const conditionBasis: ConditionBasis = condition ? 'per-cycle' : 'not-applicable';

  const { baseOvr, totalOvr, exactBaseOvr, locked } = evaluateLock(player, profile);
  const maxBaseOvr = profile.maxBaseOvr ?? 180;
  if (locked) {
    return lockedResult(action, player, totalOvr, lockedBand(player, exactBaseOvr), condition, conditionBasis, resources, talent, baseOvr, maxBaseOvr);
  }

  // One slot per stat per drill. Star decay is evaluated across the whole run,
  // not per drill, because a threshold crossed by drill 1 must make drill 2 harder.
  const slots: TrainingSlot[] = [];
  const unread = new Set<string>();
  const firstValue: Record<string, number> = {};
  for (const drill of drills) {
    const drillLevelMult = (profile.drillLevelMultipliers as Record<string, number>)[drill.intensity] ?? 1.0;
    const budget = drillBudgetPerStat(cycles, drill.stats.length);
    for (const rawStat of drill.stats) {
      const stat = rawStat.toUpperCase();
      const from = player.stats[stat];
      // An absent stat is unread, not zero: it is excluded and reported.
      if (from === undefined) { unread.add(stat); continue; }
      if (from >= profile.statCap) continue;
      firstValue[stat] = from;
      slots.push({ stat, budget, drillLevelMult, isWhite: isWhiteStat(player.role, stat) });
    }
  }

  const { projectedStats, deltas, starsCrossed, startBandIndex, ovrToNextThreshold } = runTraining({
    slots,
    baseStats: player.stats,
    knownOverall: player.overall,
    age: player.age,
    talent: talent.applied,
    statCap: profile.statCap,
    tierOvrOffset: tierOvrContribExact(player.tier, getWhiteStatKeys(player.role).length),
  });

  const starBand: StarBandPosition = {
    index: startBandIndex,
    ovrToNextThreshold,
    positionEvidence: positionEvidenceOf(player.stats),
  };

  const statDeltas: StatDelta[] = Object.entries(deltas)
    .map(([stat, delta]) => ({
      stat, from: firstValue[stat], delta: Number(delta.toFixed(1)),
      isWhite: isWhiteStat(player.role, stat),
    }))
    .filter(d => d.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  const reasons = talentReasons(talent);
  reasons.push(...starReasons(starBand, starsCrossed));
  if (condition) {
    reasons.push({
      code: 'condition.envelope',
      detail: `Raw ${condition.raw.toFixed(2)}% per cycle; billed ${condition.charge.low}–${condition.charge.high}% per cycle. The charge over ${cycles} cycles is not a modelled quantity.`,
      evidence: 'observed-envelope',
    });
  }
  if (unread.size > 0) {
    reasons.push({
      code: 'stats.unread',
      detail: `No stored value for ${[...unread].join(', ')} — excluded rather than treated as zero.`,
      evidence: 'unavailable',
    });
  }
  if (drillNames.length !== drills.length) {
    reasons.push({
      code: 'drill.unknown',
      detail: 'One or more named drills are not in the drill database and were skipped.',
      evidence: 'unavailable',
    });
  }
  reasons.push({
    code: 'drill.xpFactor',
    detail: `Drill XP factor ${profile.drillXpFactor ?? 1.0} is assumed, not calibrated — drill gain magnitudes are provisional.`,
    evidence: 'assumed',
  });
  // Unresolved model issue, recorded rather than guessed at. The game shows a
  // drill's INTENSITY (which drives condition cost) separately from its LEVEL /
  // training effect (which drives how much training a drill delivers). This code
  // indexes drillLevelMultipliers by intensity, conflating the two. The mapping
  // from displayed training effect to permanent XP has never been calibrated, so
  // no replacement formula is invented here — the magnitude is simply flagged.
  reasons.push({
    code: 'drill.levelVsIntensity',
    detail: 'Training magnitude is derived from drill intensity, which the game shows separately from drill level / training effect. That mapping is uncalibrated — treat drill gain magnitude as provisional.',
    evidence: 'assumed',
  });

  return {
    projectionStatus: 'projected',
    action,
    statDeltas,
    projectedStats,
    ovrBefore: totalOvr,
    ...ovrView(projectedStats, player.overall, totalOvr),
    starBand,
    condition,
    conditionBasis,
    resources,
    talent,
    trainingLocked: false,
    reasons,
  };
}
