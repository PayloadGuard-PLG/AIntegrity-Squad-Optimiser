/**
 * recommendation.ts — the single domain seam for "what will this action do?".
 *
 * This module composes existing, proven machinery. It implements no mathematics
 * of its own:
 *
 *   gains        → engineMath.projectCoachGains / drillBudgetPerStat + statGainFromBudget
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
 *   - "no condition mechanic for this action" is stated, not encoded as zero.
 */

import {
  projectCoachGains, drillBudgetPerStat, statGainFromBudget, combinedMultiplier,
  paddedStatSum, exactOvrFromSum, baseOvrFromTotal, isTrainingLocked,
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

// ── Coach action ─────────────────────────────────────────────────────────────

export interface CoachActionInput {
  player: Player;
  /** Stats the scanner actually saw with gain ranges — never an assumed category. */
  stats: string[];
  sessions: number;
  profile: GameProfile;
  twoxAd?: boolean;
  label?: string;
}

/**
 * Coach projection. Budget comes from engineMath.coachBudgetPerStat via
 * projectCoachGains — the geometric model confirmed in Sprint 34. The linear
 * model is falsified; do not reintroduce it.
 *
 * starsGained is 0: Sprint 34 attributed the ×N plateau to geometric budget
 * decay, not in-session star decay, and Sprint 31 fitted four data points
 * without it. It is therefore not applied to any projection.
 */
export function projectCoachAction(input: CoachActionInput): RecommendationResult {
  const { player, stats, sessions, profile, twoxAd = false } = input;
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
  const gains = projectCoachGains({
    sessions,
    statValues,
    whiteStats,
    age: player.age,
    talent: talent.applied,
    sessionOvrGainSoFar: 0,
    twoxAd,
    drillLevelMult: 1.0,
  });

  const projectedStats = { ...player.stats };
  const statDeltas: StatDelta[] = [];
  for (const [stat, delta] of Object.entries(gains)) {
    if (delta <= 0) continue;
    const from = statValues[stat];
    projectedStats[stat] = Math.min(from + delta, profile.statCap);
    statDeltas.push({ stat, from, delta: Number(delta.toFixed(1)), isWhite: whiteStats.has(stat) });
  }
  statDeltas.sort((a, b) => b.delta - a.delta);

  const reasons = talentReasons(talent);
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
  twoxAd?: boolean;
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
  const { player, drillNames, cycles, profile, surge = SURGE_STATE_SEASON_START, twoxAd = false } = input;
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

  const projectedStats = { ...player.stats };
  const totals: Record<string, { from: number; delta: number; isWhite: boolean }> = {};
  const unread = new Set<string>();

  for (const drill of drills) {
    const drillLevelMult = (profile.drillLevelMultipliers as Record<string, number>)[drill.intensity] ?? 1.0;
    const budget = drillBudgetPerStat(cycles, drill.stats.length);
    for (const rawStat of drill.stats) {
      const stat = rawStat.toUpperCase();
      const from = projectedStats[stat];
      // An absent stat is unread, not zero: it is excluded and reported.
      if (from === undefined) { unread.add(stat); continue; }
      if (from >= profile.statCap) continue;
      const isWhite = isWhiteStat(player.role, stat);
      const mult = combinedMultiplier({
        age: player.age, talent: talent.applied, isWhite,
        starsGained: 0, twoxAd, drillLevelMult,
      });
      const delta = statGainFromBudget(from, budget, mult);
      if (delta <= 0) continue;
      if (!totals[stat]) totals[stat] = { from: player.stats[stat] ?? from, delta: 0, isWhite };
      projectedStats[stat] = Math.min(from + delta, profile.statCap);
      totals[stat].delta += delta;
    }
  }

  const statDeltas: StatDelta[] = Object.entries(totals)
    .map(([stat, v]) => ({ stat, from: v.from, delta: Number(v.delta.toFixed(1)), isWhite: v.isWhite }))
    .filter(d => d.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  const reasons = talentReasons(talent);
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
