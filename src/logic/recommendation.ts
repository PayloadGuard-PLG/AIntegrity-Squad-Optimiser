/**
 * recommendation.ts — the single domain seam for "what will this action do?".
 *
 * This module composes existing, proven machinery. It implements no mathematics
 * of its own:
 *
 *   gains        → engineMath.coachBudgetPerStat / drillBudgetPerStat, then
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
 */

import {
  coachBudgetPerStat, drillBudgetPerStat, statGainFromBudget, combinedMultiplier,
  starsGainedFromOvrGain, paddedStatSum, exactOvrFromSum, baseOvrFromTotal,
  isTrainingLocked,
} from '../engine/engineMath';
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

export interface RecommendationResult {
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
  condition: SessionDrain | null;
  conditionBasis: ConditionBasis;
  resources: ResourceRequirement[];
  talent: TalentPolicy;
  trainingLocked: boolean;
  reasons: RecommendationReason[];
}

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

function starReasons(starsCrossed: number): RecommendationReason[] {
  if (starsCrossed <= 0) return [];
  return [{
    code: 'training.starDecay',
    detail: `Projection crosses ${starsCrossed} star threshold${starsCrossed > 1 ? 's' : ''}; training past each one is charged at the reduced rate.`,
    evidence: 'calibrated',
  }];
}

/** Shared lock evaluation. Base OVR = total − the tier's OVR contribution. */
function evaluateLock(player: Player, profile: GameProfile) {
  const sum = paddedStatSum(player.stats, player.overall);
  const totalOvr = sum === null ? player.overall : Math.floor(exactOvrFromSum(sum));
  const whiteCount = getWhiteStatKeys(player.role).length;
  const baseOvr = baseOvrFromTotal(totalOvr, player.tier, whiteCount);
  void profile;
  return { totalOvr, baseOvr, locked: isTrainingLocked(baseOvr) };
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
  condition: SessionDrain | null,
  conditionBasis: ConditionBasis,
  resources: ResourceRequirement[],
  talent: TalentPolicy,
  baseOvr: number,
  maxBaseOvr: number,
): RecommendationResult {
  return {
    action,
    statDeltas: [],
    projectedStats: { ...player.stats },
    ovrBefore,
    ovrAfterExact: ovrBefore,
    ovrAfterFloored: Math.floor(ovrBefore),
    ovrDelta: 0,
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
 * star thresholds.
 *
 * Why this is not `starsGained: 0`, and not a single sample either:
 * `starDecayPerSession` and `sessionBudgetDecay` are two different mechanics.
 * Sprint 34 established that geometric SESSION-BUDGET decay explains the ×20/×40
 * plateau; it said nothing about star decay, which applies when a player crosses
 * an OVR/star threshold and makes subsequent training harder. Sampling the star
 * count once at the start would let a long run cross a threshold and keep the
 * cheaper pre-threshold rate for the whole action.
 *
 * The method is numerical, not a new formula: the budget is advanced at a fixed
 * star count until the next threshold is reached, the star count is recomputed,
 * and the remainder continues at the new rate. `statGainFromBudget` is monotonic
 * in budget, so the crossing point is found by bisection on the fraction of the
 * remaining budget. Every multiplier and every gain still comes from the
 * verified engine primitives.
 *
 * OVR is tracked EXACTLY (unfloored) throughout: progress below the displayed
 * integer is real internal state, and a small gain can carry a player across a
 * threshold the floored value would hide.
 */
function runTraining(params: {
  slots: TrainingSlot[];
  baseStats: Record<string, number>;
  knownOverall: number;
  age: number;
  talent: TalentTier;
  statCap: number;
  /** OVR already gained earlier in the same session/plan, so stars keep accruing
   *  across chained actions instead of resetting at each one. */
  sessionOvrGainSoFar: number;
}): { projectedStats: Record<string, number>; deltas: Record<string, number>; starsCrossed: number } {
  const { slots, baseStats, knownOverall, age, talent, statCap, sessionOvrGainSoFar } = params;
  const projectedStats = { ...baseStats };
  const deltas: Record<string, number> = {};
  if (slots.length === 0) return { projectedStats, deltas, starsCrossed: 0 };

  const exactOvr = (stats: Record<string, number>) => {
    const sum = paddedStatSum(stats, knownOverall);
    return sum === null ? knownOverall : exactOvrFromSum(sum);
  };
  // Offsetting by the gain already banked keeps threshold counting continuous.
  const ovrAtStart = exactOvr(baseStats) - sessionOvrGainSoFar;

  // Applies `fraction` of each slot's remaining budget to a scratch copy.
  const applyFraction = (from: Record<string, number>, remaining: number[], fraction: number, stars: number) => {
    const next = { ...from };
    slots.forEach((slot, i) => {
      const budget = remaining[i] * fraction;
      if (budget <= 0) return;
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

  let remaining = slots.map(s => s.budget);
  let current = projectedStats;
  let starsCrossed = 0;
  // The star count is carried, not re-derived from the running OVR. Bisection
  // lands the run just BELOW the threshold, so re-deriving would read the old
  // band back and the run would converge on the boundary without ever passing it.
  let stars = starsGainedFromOvrGain(sessionOvrGainSoFar);

  for (let segment = 0; segment < MAX_STAR_SEGMENTS; segment++) {
    const full = applyFraction(current, remaining, 1, stars);
    if (starsGainedFromOvrGain(exactOvr(full) - ovrAtStart) <= stars) {
      current = full;                       // the rest of the run stays inside this star band
      break;
    }
    // The run reaches a threshold. Advance to it, then charge the remainder at
    // the next star count.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < THRESHOLD_BISECTIONS; i++) {
      const mid = (lo + hi) / 2;
      const probe = applyFraction(current, remaining, mid, stars);
      if (starsGainedFromOvrGain(exactOvr(probe) - ovrAtStart) <= stars) lo = mid; else hi = mid;
    }
    current = applyFraction(current, remaining, lo, stars);
    remaining = remaining.map(b => b * (1 - lo));
    stars++;
    starsCrossed++;
  }

  for (const stat of new Set(slots.map(s => s.stat))) {
    const delta = (current[stat] ?? 0) - (baseStats[stat] ?? 0);
    if (delta > 0) deltas[stat] = delta;
  }
  return { projectedStats: current, deltas, starsCrossed };
}

// ── Coach action ─────────────────────────────────────────────────────────────

export interface CoachActionInput {
  player: Player;
  /** Stats the scanner actually saw with gain ranges — never an assumed category. */
  stats: string[];
  sessions: number;
  profile: GameProfile;
  /** OVR gained earlier in the same plan; keeps star thresholds accruing across
   *  chained actions. Defaults to 0 for a standalone projection. */
  sessionOvrGainSoFar?: number;
  label?: string;
}

/**
 * Academy coach projection. Budget comes from engineMath.coachBudgetPerStat —
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
export function projectCoachAction(input: CoachActionInput): RecommendationResult {
  const { player, stats, sessions, profile, sessionOvrGainSoFar = 0 } = input;
  const talent = resolveTalentPolicy(player);
  const action: RecommendedAction = {
    kind: 'coach',
    label: input.label ?? `Coach ×${sessions}`,
    stats: [...stats],
    sessions,
  };
  const resources: ResourceRequirement[] = [
    { kind: 'coachSessions', amount: sessions, label: `${sessions} coaching sessions` },
  ];
  const { baseOvr, totalOvr, locked } = evaluateLock(player, profile);
  const maxBaseOvr = profile.maxBaseOvr ?? 180;

  if (locked) {
    return lockedResult(action, player, totalOvr, null, 'not-applicable', resources, talent, baseOvr, maxBaseOvr);
  }

  const statValues: Record<string, number> = {};
  const missing: string[] = [];
  for (const stat of stats) {
    const from = player.stats[stat];
    if (from === undefined) missing.push(stat); else statValues[stat] = from;
  }

  const whiteStats = new Set(stats.filter(s => isWhiteStat(player.role, s)));
  const budget = coachBudgetPerStat(sessions, Object.keys(statValues));
  const { projectedStats, deltas, starsCrossed } = runTraining({
    slots: Object.keys(statValues).map(stat => ({
      stat, budget, drillLevelMult: 1.0, isWhite: whiteStats.has(stat),
    })),
    baseStats: player.stats,
    knownOverall: player.overall,
    age: player.age,
    talent: talent.applied,
    statCap: profile.statCap,
    sessionOvrGainSoFar,
  });

  const statDeltas: StatDelta[] = Object.entries(deltas)
    .map(([stat, delta]) => ({
      stat, from: statValues[stat], delta: Number(delta.toFixed(1)), isWhite: whiteStats.has(stat),
    }))
    .filter(d => d.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  const reasons = talentReasons(talent);
  reasons.push(...starReasons(starsCrossed));
  if (missing.length > 0) {
    reasons.push({
      code: 'stats.unread',
      detail: `No stored value for ${missing.join(', ')} — excluded rather than treated as zero.`,
      evidence: 'unavailable',
    });
  }

  return {
    action,
    statDeltas,
    projectedStats,
    ovrBefore: totalOvr,
    ...ovrView(projectedStats, player.overall, totalOvr),
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
  /** OVR gained earlier in the same plan; see CoachActionInput. */
  sessionOvrGainSoFar?: number;
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
  const { player, drillNames, cycles, profile, surge = SURGE_STATE_SEASON_START, sessionOvrGainSoFar = 0 } = input;
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

  const { baseOvr, totalOvr, locked } = evaluateLock(player, profile);
  const maxBaseOvr = profile.maxBaseOvr ?? 180;
  if (locked) {
    return lockedResult(action, player, totalOvr, condition, conditionBasis, resources, talent, baseOvr, maxBaseOvr);
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

  const { projectedStats, deltas, starsCrossed } = runTraining({
    slots,
    baseStats: player.stats,
    knownOverall: player.overall,
    age: player.age,
    talent: talent.applied,
    statCap: profile.statCap,
    sessionOvrGainSoFar,
  });

  const statDeltas: StatDelta[] = Object.entries(deltas)
    .map(([stat, delta]) => ({
      stat, from: firstValue[stat], delta: Number(delta.toFixed(1)),
      isWhite: isWhiteStat(player.role, stat),
    }))
    .filter(d => d.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  const reasons = talentReasons(talent);
  reasons.push(...starReasons(starsCrossed));
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
    action,
    statDeltas,
    projectedStats,
    ovrBefore: totalOvr,
    ...ovrView(projectedStats, player.overall, totalOvr),
    condition,
    conditionBasis,
    resources,
    talent,
    trainingLocked: false,
    reasons,
  };
}
