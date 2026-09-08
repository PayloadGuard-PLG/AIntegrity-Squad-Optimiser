/**
 * recommendation-seam-test — contract characterization for the future shared
 * recommendation result.
 *
 * This file does NOT re-verify the engine (see tests/engine-test.ts, the Z3 /
 * Crosshair / Dafny layer and the TS↔Python differential). It pins the three
 * facts a consolidation of the Drills / Coaches / Results projection paths can
 * most easily destroy by accident:
 *
 *   1. which coach budget model is authoritative,
 *   2. that the Normal-talent policy makes a coach projection independent of
 *      the talent stored on the player record,
 *   3. that charged condition cost is a range carrying its own confidence, and
 *      that collapsing it to a scalar discards evidence.
 *
 * These are invariants of MEANING. They deliberately say nothing about where a
 * shared result should live or what shape its types take.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ageMultiplier, coachBudgetPerStat, greyMultiplier, xpCostAtStat } from '../src/engine/engineMath';
import { estimateStatGainPct } from '../src/logic/xpEngine';
import { sessionDrain, calculateActualLoss, chargedDrainRange, MIN_CONDITION_DRAIN_PCT } from '../src/utils/conditionEngine';
import { DRILL_LIST } from '../src/database/drillDatabase';
import { SURGE_STATE_SEASON_START, GameProfile, TalentTier } from '../src/types/resources';
import profileJson from '../profiles/game_2025.json';

const profile = profileJson as unknown as GameProfile;
const STATS = ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'];

/** The formula three screens currently inline for a coaching budget. Kept here
 *  as the FOIL, never as an alternative worth preserving. */
const linearCoachBudget = (sessions: number, numStats: number) =>
  sessions * profile.baseXpPerSession / numStats;

test('coachBudgetPerStat is the authoritative coach budget; the linear formula is not equivalent', () => {
  // A single session cannot discriminate the two models — geometric decay has
  // not yet compounded. Anything above one session does.
  assert.equal(coachBudgetPerStat(1, STATS), linearCoachBudget(1, STATS.length));

  for (const sessions of [4, 20, 40, 114]) {
    const geometric = coachBudgetPerStat(sessions, STATS);
    const linear = linearCoachBudget(sessions, STATS.length);
    assert.ok(geometric < linear,
      `geometric budget must be below linear at ×${sessions} (got ${geometric} vs ${linear})`);
  }

  // The gap is not cosmetic: it moves a projected gain the user reads off the
  // screen. Sprint 34 resolved the ×N anomaly in favour of the geometric model
  // (LJDark Leo ×114: linear predicted 182 OVR vs 173 actual; geometric 172).
  const gainGeometric = estimateStatGainPct(coachBudgetPerStat(40, STATS), 120, 20, 0, 'Normal', true, false, 1.0, profile);
  const gainLinear = estimateStatGainPct(linearCoachBudget(40, STATS.length), 120, 20, 0, 'Normal', true, false, 1.0, profile);
  assert.ok(gainLinear - gainGeometric > 5,
    `the two budget models must be visibly different, not rounding noise (${gainGeometric} vs ${gainLinear})`);
});

test('the Normal-talent policy makes a coach projection independent of stored talent', () => {
  // CLAUDE.md: default ALL projections to Normal unless talent is confirmed
  // from the Personal Trainer tab AND back-calculated. Only Normal (1.0) is
  // confirmed; every other tier is a community estimate.
  const budget = coachBudgetPerStat(40, STATS);
  const underPolicy = (_stored: TalentTier) =>
    estimateStatGainPct(budget, 120, 20, 0, 'Normal', true, false, 1.0, profile);
  const honouringStored = (stored: TalentTier) =>
    estimateStatGainPct(budget, 120, 20, 0, stored, true, false, 1.0, profile);

  const stored: TalentTier[] = ['Fastest', 'Fast', 'Average', 'Normal', 'Slow', 'Unknown'];
  const policyResults = stored.map(underPolicy);
  for (const value of policyResults) assert.equal(value, policyResults[0]);

  // And the policy is not vacuous: honouring the stored tier genuinely changes
  // the answer, so a shared result that forgets to apply it will silently drift.
  assert.notEqual(honouringStored('Fast'), policyResults[0]);
  assert.notEqual(honouringStored('Slow'), policyResults[0]);
  // 'Unknown' has no entry in talentMultipliers and falls back to 1.0, so it
  // coincides with the policy by accident. That coincidence is not the policy.
  assert.equal(honouringStored('Unknown'), policyResults[0]);
});

test('charged condition cost is a range carrying its confidence; a scalar discards evidence', () => {
  const drills = ['Target Practice', 'Target Practice', 'Run & Strike']
    .map(name => DRILL_LIST.find(d => d.name === name))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map(d => ({ baseLoss: d.baseLoss, intensity: d.intensity }));
  assert.equal(drills.length, 3);

  const { raw, charge } = sessionDrain(drills, SURGE_STATE_SEASON_START);
  // raw is the exact mechanical cost and matches the game's pre-confirm dialog.
  assert.ok(raw > 0);
  // The charge is a distribution, and the envelope must actually contain its centre.
  assert.ok(charge.low <= charge.expected && charge.expected <= charge.high);
  assert.ok(charge.low >= MIN_CONDITION_DRAIN_PCT);
  assert.equal(charge.confidence, 'observed-envelope');
  // Provisional, not derived: the width must remain visible to any consumer.
  assert.ok(charge.high > charge.expected,
    'a multi-drill session must expose a non-degenerate envelope');

  // calculateActualLoss returns only the centre. Anything that reports this as
  // "the" cost is claiming a precision the observations do not support.
  const scalar = calculateActualLoss(drills[0].baseLoss, drills[0].intensity, SURGE_STATE_SEASON_START);
  const asRange = chargedDrainRange(raw, drills.length);
  assert.equal(scalar, chargedDrainRange(
    sessionDrain([drills[0]], SURGE_STATE_SEASON_START).raw, 1).expected);
  assert.ok(asRange.high > scalar);
});

// ─────────────────────────────────────────────────────────────────────────────
// Consolidation contract. These cover behaviour introduced by routing Drills,
// Coaches, Results and ovrProjector through src/logic/recommendation.ts.
// ─────────────────────────────────────────────────────────────────────────────

import {
  projectCoachAction, projectDrillAction, resolveTalentPolicy,
} from '../src/logic/recommendation';
import type { CoachPreviewInterval } from '../src/logic/recommendation';
import { projectOvr } from '../src/logic/ovrProjector';
import { getRecommendedDrills } from '../src/logic/controller';
import type { Player } from '../src/database/playerSchema';
import type { DrillSession, TierName } from '../src/types/resources';

const OUTFIELD: Record<string, number> = {
  TACKLING: 120, MARKING: 120, POSITIONING: 120, HEADING: 120, BRAVERY: 120,
  PASSING: 120, DRIBBLING: 120, CROSSING: 120, SHOOTING: 120, FINISHING: 120,
  FITNESS: 120, STRENGTH: 120, AGGRESSION: 120, SPEED: 120, CREATIVITY: 120,
};

const player = (over: Partial<Player> = {}): Player => ({
  id: 'p1', name: 'Subject', role: ['DC', 'DMC'], age: 20, overall: 120,
  tier: 'T0', talent: 'Normal', stats: { ...OUTFIELD }, isMutantCandidate: false,
  ...over,
});

// A displayed +lo-hi is an interval. With hidden starting progress ε∈[0,1),
// the least admitted raw XP pays `lo` steps from s; the greatest pays `hi`
// steps from the limiting start s+1. No midpoint enters this calculation.
function admittedRawXp(startStat: number, gainLo: number, gainHi: number) {
  const stepSum = (start: number, points: number) => {
    let total = 0;
    for (let i = 0; i < points; i++) total += xpCostAtStat(start + i);
    return total;
  };
  return { low: stepSum(startStat, gainLo), high: stepSum(startStat + 1, gainHi) };
}

function admittedOrdinaryCoachBudget(
  startStat: number, gainLo: number, gainHi: number, age: number, isWhite: boolean,
) {
  const raw = admittedRawXp(startStat, gainLo, gainHi);
  const efficiency = ageMultiplier(age) * greyMultiplier(isWhite);
  return { low: raw.low / efficiency, high: raw.high / efficiency };
}

function intervalIntersection(...ranges: { low: number; high: number }[]) {
  return { low: Math.max(...ranges.map(r => r.low)), high: Math.min(...ranges.map(r => r.high)) };
}

test('Reward matched evidence has no common ordinary fixed-XP coach budget', () => {
  const mehlemRaw = admittedRawXp(125, 5, 7);
  const panicRaw = admittedRawXp(115, 5, 7);
  const dallasRaw = admittedRawXp(180, 5, 7);
  assert.ok(Math.abs(mehlemRaw.low - 219.29718) < 1e-5);
  assert.ok(Math.abs(mehlemRaw.high - 320.50754) < 1e-5);
  assert.ok(Math.abs(panicRaw.low - 177.26785) < 1e-5);
  assert.ok(Math.abs(panicRaw.high - 259.08076) < 1e-5);
  assert.ok(Math.abs(dallasRaw.low - 706.72425) < 1e-5);
  assert.ok(Math.abs(dallasRaw.high - 1032.89267) < 1e-5);

  const mehlem = admittedOrdinaryCoachBudget(125, 5, 7, 26, true);
  const panic = admittedOrdinaryCoachBudget(115, 5, 7, 26, false);
  const dallas = admittedOrdinaryCoachBudget(180, 5, 7, 27, true);

  const sameAgeWhiteGrey = intervalIntersection(mehlem, panic);
  assert.ok(sameAgeWhiteGrey.low > sameAgeWhiteGrey.high,
    'Mehlem/Panic must have an empty common-budget intersection under ordinary grey ×0.22');
  const sameAgeBracketWhite = intervalIntersection(mehlem, dallas);
  assert.ok(sameAgeBracketWhite.low > sameAgeBracketWhite.high,
    'Mehlem/Dallas must have an empty common-budget intersection under ordinary age 26–27 ×0.61');
});

test('Reward Coach projection abstains and preserves preview intervals', () => {
  const intervals = [{ stat: 'FINISHING', statBefore: 125, gainLo: 5, gainHi: 7 }];
  const reward = projectCoachAction({
    player: player({ age: 26, role: ['ST'], stats: { ...OUTFIELD, FINISHING: 125 }, overall: 115.3 }),
    stats: ['FINISHING'], sessions: 1, profile, transferClass: 'reward',
    observedGainIntervals: intervals,
  });
  assert.equal(reward.projectionStatus, 'unavailable');
  assert.deepEqual(reward.observedGainIntervals, intervals);
  assert.ok(reward.reasons.some(r => r.code === 'coach.rewardTransferUnresolved'));
  assert.equal('projectedStats' in reward, false,
    'unresolved must not masquerade as unchanged stats / zero gain');
  assert.equal('ovrAfterExact' in reward, false,
    'unresolved must not fabricate a post-coach OVR');

  // +0 is itself an observed interval at high stat cost, not a missing row.
  const zero = projectCoachAction({
    player: player({ age: 32, role: ['ST'], stats: { ...OUTFIELD, FINISHING: 407 } }),
    stats: ['FINISHING'], sessions: 1, profile, transferClass: 'reward',
    observedGainIntervals: [{ stat: 'FINISHING', statBefore: 407, gainLo: 0, gainHi: 0 }],
  });
  assert.deepEqual(zero.observedGainIntervals[0],
    { stat: 'FINISHING', statBefore: 407, gainLo: 0, gainHi: 0 });
});

test('the same coach scenario cannot produce conflicting projections', () => {
  // The Coaches screen projects a run; Results re-projects the recorded entry.
  // Both now call projectCoachAction, so the numbers are identical by
  // construction — and identical regardless of the talent on the record, which
  // is what previously drove them apart (+59.5 vs +42.1 for a stored Slow).
  const scenario = { stats: STATS, sessions: 40, profile };
  const asCoachesRuns = projectCoachAction({ player: player(), ...scenario });

  for (const stored of ['Fastest', 'Fast', 'Average', 'Normal', 'Slow', 'Unknown'] as TalentTier[]) {
    const asResultsReprojects = projectCoachAction({ player: player({ talent: stored }), ...scenario });
    assert.deepEqual(asResultsReprojects.statDeltas, asCoachesRuns.statDeltas,
      `stored talent ${stored} must not change the projection`);
    assert.equal(asResultsReprojects.ovrDelta, asCoachesRuns.ovrDelta);
    assert.equal(asResultsReprojects.talent.applied, 'Normal');
    assert.equal(asResultsReprojects.talent.stored, stored);
  }
});

test('the shared coach projection uses the geometric budget, not the linear one', () => {
  const viaSeam = projectCoachAction({ player: player(), stats: STATS, sessions: 40, profile });
  const seamGain = viaSeam.statDeltas.find(d => d.stat === 'TACKLING')!.delta;

  const geometric = estimateStatGainPct(coachBudgetPerStat(40, STATS), 120, 20, 0, 'Normal', true, false, 1.0, profile);
  const linear = estimateStatGainPct(linearCoachBudget(40, STATS.length), 120, 20, 0, 'Normal', true, false, 1.0, profile);
  assert.equal(seamGain, Number(geometric.toFixed(1)));
  assert.notEqual(seamGain, Number(linear.toFixed(1)));
});

test('talent policy is resolved in exactly one place and is reported by the result', () => {
  // resolveTalentPolicy is the only decision point. A result always says which
  // multiplier it used and which one the card claims — 'Unknown' included, which
  // lands on Normal by policy rather than by a missing multiplier-table entry.
  assert.deepEqual(resolveTalentPolicy({ talent: 'Slow' }),
    { applied: 'Normal', stored: 'Slow', source: 'normal-default-policy' });
  assert.deepEqual(resolveTalentPolicy({ talent: 'Unknown' }),
    { applied: 'Normal', stored: 'Unknown', source: 'normal-default-policy' });

  const drill = projectDrillAction({ player: player({ talent: 'Fast' }), drillNames: ['Touch Training'], cycles: 10, profile });
  assert.equal(drill.talent.applied, 'Normal');
  assert.ok(drill.reasons.some(r => r.code === 'talent.substituted'));
});

test('the 180 base-OVR training lock survives on every action, not just projectOvr', () => {
  const lockedStats = Object.fromEntries(Object.keys(OUTFIELD).map(k => [k, 180]));
  const locked = player({ stats: lockedStats, overall: 180 });

  for (const result of [
    projectCoachAction({ player: locked, stats: STATS, sessions: 40, profile }),
    projectDrillAction({ player: locked, drillNames: ['Touch Training'], cycles: 50, profile }),
  ]) {
    assert.equal(result.trainingLocked, true);
    assert.deepEqual(result.statDeltas, []);
    assert.equal(result.ovrDelta, 0);
    assert.deepEqual(result.projectedStats, lockedStats);
    assert.ok(result.reasons.some(r => r.code === 'training.locked'));
  }

  // And the pre-existing plan path still reports it — see also
  // tests/projection-test.ts §5, which owns the end-to-end assertion.
  const sessions: DrillSession[] = [{ drillName: 'Touch Training', sessionCount: 50, drillLevel: 'Very Easy' }];
  const { finalOvr, warnings } = projectOvr(locked, sessions, 'Normal', 'Very Easy', null, 0, false, profile);
  assert.ok(finalOvr <= 180);
  assert.ok(warnings.some(w => w.toLowerCase().includes('cap')));
});

test('condition stays a range through the shared result and is never multiplied out', () => {
  const cycles = 7;
  const result = projectDrillAction({ player: player(), drillNames: ['Target Practice', 'Run & Strike'], cycles, profile });

  assert.equal(result.conditionBasis, 'per-cycle');
  const charge = result.condition!.charge;
  assert.equal(charge.confidence, 'observed-envelope');
  assert.ok(charge.low <= charge.expected && charge.expected <= charge.high);

  // The per-cycle envelope must NOT have been scaled by the cycle count: the
  // charge over N cycles has never been observed and is not synthesised here.
  const oneCycle = projectDrillAction({ player: player(), drillNames: ['Target Practice', 'Run & Strike'], cycles: 1, profile });
  assert.deepEqual(result.condition!.charge, oneCycle.condition!.charge);
  assert.ok(result.reasons.some(r => r.code === 'condition.envelope' && r.evidence === 'observed-envelope'));

  // A coach action has no modelled condition mechanic. That is stated, not zeroed.
  const coach = projectCoachAction({ player: player(), stats: STATS, sessions: 4, profile });
  assert.equal(coach.condition, null);
  assert.equal(coach.conditionBasis, 'not-applicable');
});

test('drill ranking exposes the charge envelope instead of a point cost', () => {
  const rows = getRecommendedDrills(player());
  assert.ok(rows.length > 0);
  for (const row of rows) {
    // No scalar `conditionCost` remains for a consumer to print as "the" cost.
    assert.equal('conditionCost' in row, false);
    assert.equal(row.condition.confidence, 'observed-envelope');
    assert.ok(row.condition.low <= row.condition.expected && row.condition.expected <= row.condition.high);
    // ROI is ordinal and says so, and carries the envelope's effect on itself.
    assert.equal(row.roiBasis, 'expected-charge');
    assert.ok(row.roiRange.low <= row.roi && row.roi <= row.roiRange.high);
  }
});

test('unread stats are excluded and reported, never treated as zero', () => {
  // A player whose CREATIVITY was never entered must not be projected from 0.
  const partial = { ...OUTFIELD };
  delete partial.CREATIVITY;
  const result = projectDrillAction({ player: player({ stats: partial }), drillNames: ['Touch Training'], cycles: 10, profile });

  assert.ok(!result.statDeltas.some(d => d.stat === 'CREATIVITY'));
  assert.equal('CREATIVITY' in result.projectedStats, false);
  assert.ok(result.reasons.some(r => r.code === 'stats.unread' && r.evidence === 'unavailable'));

  const coach = projectCoachAction({ player: player({ stats: partial }), stats: ['CREATIVITY'], sessions: 10, profile });
  assert.deepEqual(coach.statDeltas, []);
  assert.ok(coach.reasons.some(r => r.code === 'stats.unread'));
});

test('the drill XP factor is reported as an assumption, not a calibration', () => {
  const result = projectDrillAction({ player: player(), drillNames: ['Touch Training'], cycles: 10, profile });
  const factor = result.reasons.find(r => r.code === 'drill.xpFactor');
  assert.ok(factor);
  assert.equal(factor!.evidence, 'assumed');
  // Nothing in a projection may claim calibration for an uncalibrated input.
  assert.ok(!result.reasons.some(r => r.code === 'drill.xpFactor' && r.evidence === 'calibrated'));
});

test('screens consume the seam and cannot substitute their own projection math', () => {
  // A structural guard, deliberately blunt. The divergence this consolidation
  // removed was created by inlining budget/multiplier math in a screen, so the
  // cheapest way to stop it returning is to forbid the imports and formulas that
  // make it possible. If a screen legitimately needs one of these, it belongs in
  // src/logic/recommendation.ts and the screen consumes the result.
  const screens = ['app/(tabs)/drills.tsx', 'app/(tabs)/coaches.tsx', 'app/(tabs)/results.tsx'];
  const forbidden: Array<[RegExp, string]> = [
    [/estimateStatGainPct/, 'gain kernel called directly'],
    [/statGainFromBudget|combinedMultiplier/, 'engine multiplier used directly'],
    [/coachBudgetPerStat|drillBudgetPerStat/, 'budget computed in a screen'],
    [/baseXpPerSession/, 'XP budget formula inlined'],
    [/drillXpFactor/, 'drill XP factor applied in a screen'],
    [/starsGained/, 'star decay reintroduced'],
    [/talentMultipliers|TalentTier\s*=\s*'Normal'/, 'talent policy decided in a screen'],
  ];
  for (const file of screens) {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    for (const [pattern, why] of forbidden) {
      assert.equal(pattern.test(source), false, `${file}: ${why} (${pattern})`);
    }
    assert.ok(/from '\.\.\/\.\.\/src\/logic\/recommendation'/.test(source),
      `${file} must consume the shared recommendation seam`);
  }
});

test('Reward classification and preview intervals survive scan history into projection', () => {
  const coaches = readFileSync(join(__dirname, '..', 'app/(tabs)/coaches.tsx'), 'utf8');
  const results = readFileSync(join(__dirname, '..', 'app/(tabs)/results.tsx'), 'utf8');
  const history = readFileSync(join(__dirname, '..', 'src/services/coachHistoryService.ts'), 'utf8');

  assert.match(coaches, /scan\.isRewardCoach\s*\?\s*'reward'\s*:\s*'ordinary'/);
  assert.match(coaches, /transferClass, observedGainIntervals/,
    'Coaches projection must receive the scanner classification and intervals');
  assert.match(history, /transfer_class/);
  assert.match(history, /preview_intervals/);
  assert.match(results, /transferClass:\s*entry\.transferClass/,
    'Results replay must not erase Reward classification');
  assert.match(results, /projection\.projectionStatus\s*===\s*'unavailable'/,
    'a full plan must abstain rather than total an unresolved Reward Coach as zero');
});

test('an unclassified legacy coach entry abstains instead of projecting as ordinary', () => {
  // Coach history recorded before classification existed carries no marker of
  // which kind it was, and Reward Coaches wear the same Standard/Extensive label,
  // so the two are indistinguishable after the fact. Projecting such a row as
  // ordinary would fabricate exactly the numbers the Reward path refuses to
  // fabricate for a fresh scan.
  const legacy = projectCoachAction({
    player: player(), stats: STATS, sessions: 40, profile, transferClass: 'unknown',
  });
  assert.equal(legacy.projectionStatus, 'unavailable');
  assert.equal(legacy.transferClass, 'unknown');
  assert.ok(legacy.reasons.some(r => r.code === 'coach.transferClassUnknown'));
  assert.equal('projectedStats' in legacy, false,
    'unclassified must not masquerade as unchanged stats / zero gain');
  assert.equal('ovrAfterExact' in legacy, false,
    'unclassified must not fabricate a post-coach OVR');

  // It is a DIFFERENT abstention from Reward: one was classified and lacks a
  // calibrated transfer function, the other was never classified at all.
  const reward = projectCoachAction({
    player: player(), stats: STATS, sessions: 40, profile, transferClass: 'reward',
    observedGainIntervals: [],
  });
  assert.equal(reward.reasons.some(r => r.code === 'coach.transferClassUnknown'), false);
  assert.equal(legacy.reasons.some(r => r.code === 'coach.rewardTransferUnresolved'), false);
});

test('an unclassified row is identified by provenance, not by its stored class', () => {
  // The earlier migration back-filled every pre-existing row with the literal
  // 'ordinary', so the stored class can no longer identify legacy rows. A
  // separate source column records where the class came from, and only
  // 'observed' is trusted. Without this, legacy rows silently read as ordinary.
  const db = readFileSync(join(__dirname, '..', 'src/db/index.ts'), 'utf8');
  const history = readFileSync(join(__dirname, '..', 'src/services/coachHistoryService.ts'), 'utf8');
  assert.match(db, /transfer_class_source TEXT NOT NULL DEFAULT 'legacy-default'/,
    'existing rows must back-fill as unclassified, never as ordinary');
  assert.match(db, /ALTER TABLE coach_scan_history ADD COLUMN transfer_class_source/,
    'devices that already ran the earlier migration need the source column too');
  assert.match(history, /transfer_class_source !== 'observed'[\s\S]{0,80}'unknown'/,
    'the reader must downgrade any row whose class was never observed');
  assert.match(history, /'observed'/,
    'the writer must record that it actually determined the class');
});

test('an unclassified entry blocks a Results plan total rather than skipping it', () => {
  const results = readFileSync(join(__dirname, '..', 'app/(tabs)/results.tsx'), 'utf8');
  assert.match(results, /transferClass === 'unknown'/,
    'Results must distinguish an unclassified entry from an unresolved Reward Coach');
  assert.match(results, /projection\.projectionStatus\s*===\s*'unavailable'/,
    'and must still refuse to total the plan');
});

// ─────────────────────────────────────────────────────────────────────────────
// Reward Coach evidence preservation. The interval is the observation; it must
// survive the seam unchanged, and must never be reduced to a single number.
// ─────────────────────────────────────────────────────────────────────────────

test('an observed interval survives with no baseline attached', () => {
  // statBefore is a SEPARATE observation. The scanner's nearest-number search
  // returns nothing when the row's value lands in another OCR block, which is
  // routine in the three-column layout. Requiring it discarded a successful
  // measurement of the interval because a different measurement failed.
  const intervals: CoachPreviewInterval[] = [
    { stat: 'FINISHING', gainLo: 5, gainHi: 7 },          // no baseline read
    { stat: 'SHOOTING', statBefore: 152, gainLo: 3, gainHi: 4 }, // baseline read
  ];
  const r = projectCoachAction({
    player: player(), stats: ['FINISHING', 'SHOOTING'], sessions: 2, profile,
    transferClass: 'reward', observedGainIntervals: intervals,
  });
  assert.equal(r.projectionStatus, 'unavailable');
  assert.equal(r.observedGainIntervals.length, 2,
    'an interval without a baseline must not be dropped');
  const finishing = r.observedGainIntervals.find(i => i.stat === 'FINISHING')!;
  assert.equal(finishing.gainLo, 5);
  assert.equal(finishing.gainHi, 7);
  assert.equal('statBefore' in finishing && finishing.statBefore !== undefined, false,
    'an unobserved baseline is absent, never reported as 0');
  // And the reason must reflect that evidence EXISTS.
  const reason = r.reasons.find(x => x.code === 'coach.rewardTransferUnresolved')!;
  assert.match(reason.detail, /retained as observations/);
});

test('intervals pass through the Reward seam by identity', () => {
  // The seam may not reshape, reorder the endpoints, round, or otherwise
  // "tidy" an observation. What was read is what comes out.
  const intervals: CoachPreviewInterval[] = [
    { stat: 'FINISHING', statBefore: 134, gainLo: 5, gainHi: 7 },
    { stat: 'PASSING', gainLo: 0, gainHi: 11 },
    { stat: 'DRIBBLING', statBefore: 156, gainLo: 2, gainHi: 2 },
  ];
  const r = projectCoachAction({
    player: player(), stats: ['FINISHING', 'PASSING', 'DRIBBLING'], sessions: 2, profile,
    transferClass: 'reward', observedGainIntervals: intervals,
  });
  assert.deepEqual(r.observedGainIntervals, intervals);
});

test('a +0–0 preview is observed evidence, not a missing reading', () => {
  const r = projectCoachAction({
    player: player({ age: 32 }), stats: ['FINISHING'], sessions: 1, profile,
    transferClass: 'reward',
    observedGainIntervals: [{ stat: 'FINISHING', statBefore: 407, gainLo: 0, gainHi: 0 }],
  });
  assert.equal(r.observedGainIntervals.length, 1);
  assert.deepEqual(r.observedGainIntervals[0],
    { stat: 'FINISHING', statBefore: 407, gainLo: 0, gainHi: 0 });
  // Evidence exists, so the message must not claim none was captured.
  const reason = r.reasons.find(x => x.code === 'coach.rewardTransferUnresolved')!;
  assert.doesNotMatch(reason.detail, /no usable/i);
});

test('the Reward path cannot collapse an interval into a scalar', () => {
  // STRUCTURAL. An unresolved transfer must expose no single number derived
  // from the interval — no midpoint, no width, no projected stat, no OVR.
  // Serialise the whole result and hunt for any of them.
  const lo = 5, hi = 11;                       // midpoint 8, width 6 — distinct
  const r = projectCoachAction({
    player: player(), stats: ['FINISHING'], sessions: 2, profile,
    transferClass: 'reward',
    observedGainIntervals: [{ stat: 'FINISHING', statBefore: 134, gainLo: lo, gainHi: hi }],
  });
  assert.equal('projectedStats' in r, false);
  assert.equal('ovrAfterExact' in r, false);
  assert.equal('statDeltas' in r, false);
  assert.equal('ovrDelta' in r, false);

  const numbers: number[] = [];
  JSON.stringify(r, (_k, v) => { if (typeof v === 'number') numbers.push(v); return v; });
  const midpoint = (lo + hi) / 2;
  assert.equal(numbers.includes(midpoint), false,
    `the midpoint ${midpoint} must never appear anywhere in a Reward result`);
  assert.equal(numbers.includes(hi - lo), false,
    'the interval width is not a measurement either');
  // Both endpoints must survive intact.
  assert.ok(numbers.includes(lo) && numbers.includes(hi));
});

test('manual selection cannot downgrade a Reward Coach or clear its intervals', () => {
  // Manual type/category selection resolves WHICH STATS the coach covers — the
  // ambiguity a human is there to settle. It is not an observation about the
  // coach's class, and it says nothing about intervals already read. These two
  // handlers previously reset transferClass to 'ordinary' and wiped the
  // intervals, so one tap after a Reward scan silently reclassified it and the
  // ordinary geometric transfer produced a number for a falsified transfer.
  const src = readFileSync(join(__dirname, '..', 'app/(tabs)/coaches.tsx'), 'utf8');
  // Handles both declaration forms in this file: `function foo(` and
  // `const foo = useCallback((` — selectPlayer is the latter.
  const body = (fn: string) => {
    let i = src.indexOf(`function ${fn}(`);
    if (i < 0) i = src.indexOf(`const ${fn} = `);
    assert.ok(i > -1, `${fn} not found`);
    const end = src.indexOf('\n  }', i);
    return src.slice(i, end > -1 ? end : undefined);
  };
  for (const fn of ['selectCoachType', 'selectCoachCategory']) {
    assert.doesNotMatch(body(fn), /setTransferClass\(/,
      `${fn} must not reclassify the coach`);
    assert.doesNotMatch(body(fn), /setObservedGainIntervals\(/,
      `${fn} must not discard observed intervals`);
  }
  // The genuine reset points remain — changing player, and applying a result.
  assert.match(body('selectPlayer'), /setObservedGainIntervals\(\[\]\)/);
  assert.match(body('applyGains'), /setObservedGainIntervals\(\[\]\)/);
});

test('the scan keeps an interval whose baseline was not read', () => {
  // The capture filter must gate on the interval's own validity only.
  const src = readFileSync(join(__dirname, '..', 'app/(tabs)/coaches.tsx'), 'utf8');
  const i = src.indexOf('const gainRanges');
  const filter = src.slice(i, src.indexOf('const intervals', i));
  assert.doesNotMatch(filter, /cap\.statBefore\s*>\s*0\s*\)/,
    'the interval must not be gated on a separate, possibly-absent observation');
  assert.match(filter, /cap\.gainHi\s*>=\s*cap\.gainLo/,
    'it must still reject a malformed interval');
});

test('no midpoint of an observed interval exists in the coach path', () => {
  // A talent back-calculation that consumed a midpoint (estimateTalentFromGain)
  // was deleted in this change. Nothing may reintroduce one.
  for (const f of ['src/logic/recommendation.ts', 'app/(tabs)/coaches.tsx', 'src/engine/engineMath.ts']) {
    const src = readFileSync(join(__dirname, '..', f), 'utf8');
    const code = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    assert.doesNotMatch(code, /gainLo\s*\+\s*gainHi/, `${f} computes an interval midpoint`);
    assert.doesNotMatch(code, /\bgainMid\b/, `${f} still references a gain midpoint`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Semantic correction pass. Star-threshold decay is a real mechanic, separate
// from session-budget decay; the match-form doubling item is not a permanent
// attribute multiplier.
// ─────────────────────────────────────────────────────────────────────────────

import { starDecayMultiplier, combinedMultiplier } from '../src/engine/engineMath';

test('star-threshold decay is applied, and is not the same mechanic as session-budget decay', () => {
  // Two different constants for two different things. sessionBudgetDecay (0.99)
  // shapes how much XP a long coaching run delivers; starDecayPerSession (0.85)
  // makes training harder once a star threshold has been crossed. Neither
  // substitutes for the other.
  assert.notEqual(profile.sessionBudgetDecay, profile.starDecayPerSession);
  assert.equal(starDecayMultiplier(0), 1);
  assert.ok(starDecayMultiplier(1) < 1);

  const base = { age: 20, talent: 'Normal', isWhite: true, twoxAd: false, drillLevelMult: 1.0 };
  assert.ok(combinedMultiplier({ ...base, starsGained: 1 }) < combinedMultiplier({ ...base, starsGained: 0 }),
    'crossing a star must make subsequent training less efficient');
});

test('a run crossing a star threshold is charged the reduced rate for the remainder', () => {
  // A run long enough to cross a 20-OVR threshold must not be projected entirely
  // at the pre-threshold rate. Compare against the same total budget delivered as
  // two halves with the player advanced in between: the stepped projection must
  // not exceed a flat-rate projection of the same size.
  const subject = player({ age: 18, overall: 90, stats: Object.fromEntries(Object.keys(OUTFIELD).map(k => [k, 90])) });
  const long = projectCoachAction({ player: subject, stats: STATS, sessions: 400, profile });

  assert.ok(long.ovrDelta > 20, `the run must actually cross a threshold (got +${long.ovrDelta})`);
  assert.ok(long.reasons.some(r => r.code === 'training.starDecay'),
    'a crossing must be reported, not silently absorbed');

  // Flat-rate control: the same budget with stars pinned at 0 throughout.
  const budget = coachBudgetPerStat(400, STATS);
  const flat = STATS.reduce((sum, stat) =>
    sum + estimateStatGainPct(budget, subject.stats[stat], 18, 0, 'Normal', true, false, 1.0, profile), 0);
  const stepped = long.statDeltas.reduce((sum, d) => sum + d.delta, 0);
  assert.ok(stepped < flat,
    `stepped projection (${stepped.toFixed(1)}) must be below the flat starsGained=0 projection (${flat.toFixed(1)})`);
});

test('a run that stays inside one star band is unaffected by the stepping', () => {
  // The correction must not perturb short runs: below the first threshold the
  // projection is still exactly the un-decayed gain.
  const short = projectCoachAction({ player: player(), stats: STATS, sessions: 40, profile });
  assert.ok(short.ovrDelta < 20);
  assert.equal(short.reasons.some(r => r.code === 'training.starDecay'), false);
  const expected = estimateStatGainPct(coachBudgetPerStat(40, STATS), 120, 20, 0, 'Normal', true, false, 1.0, profile);
  assert.equal(short.statDeltas.find(d => d.stat === 'TACKLING')!.delta, Number(expected.toFixed(1)));
});

test('fractional progress below the displayed integer is preserved across a projection', () => {
  const result = projectCoachAction({ player: player(), stats: ['TACKLING'], sessions: 4, profile });
  const projected = result.projectedStats.TACKLING;
  assert.ok(projected > 120);
  // Not rounded to an integer: sub-integer progress is real internal state and a
  // later small gain can carry the player over a hidden threshold.
  assert.notEqual(projected, Math.round(projected));
  assert.ok(Math.abs(result.ovrAfterExact - Math.floor(result.ovrAfterExact)) >= 0);
});

test('the match-form doubling item cannot change permanent drill stat gain', () => {
  // The doubling item is a match-form / teamplay effect however it was acquired.
  // It is not a development coach and must not touch permanent attributes. The
  // seam accepts no input for it at all, so the only way it could leak in is
  // through combinedMultiplier — which every permanent-XP path pins to false.
  const withoutBoost = projectDrillAction({ player: player(), drillNames: ['Touch Training'], cycles: 30, profile });
  const attempted = projectDrillAction({
    player: player(), drillNames: ['Touch Training'], cycles: 30, profile,
    // @ts-expect-error the seam must not accept a match-form boost as an input
    twoxAd: true,
  });
  assert.deepEqual(attempted.statDeltas, withoutBoost.statDeltas);
  assert.equal(attempted.ovrDelta, withoutBoost.ovrDelta);
  assert.deepEqual(attempted.projectedStats, withoutBoost.projectedStats);
});

test('the match-form doubling item cannot change academy coach stat gain', () => {
  const withoutBoost = projectCoachAction({ player: player(), stats: STATS, sessions: 40, profile });
  const attempted = projectCoachAction({
    player: player(), stats: STATS, sessions: 40, profile,
    // @ts-expect-error the seam must not accept a match-form boost as an input
    twoxAd: true,
  }) as ReturnType<typeof projectDrillAction>;
  assert.deepEqual(attempted.statDeltas, withoutBoost.statDeltas);
  assert.equal(attempted.ovrDelta, withoutBoost.ovrDelta);

  // And the plan path ignores the manager-profile flag for the same reason.
  const sessions: DrillSession[] = [{ drillName: 'Touch Training', sessionCount: 30, drillLevel: 'Very Easy' }];
  const off = projectOvr(player(), sessions, 'Normal', 'Very Easy', null, 0, false, profile);
  const on = projectOvr(player(), sessions, 'Normal', 'Very Easy', null, 0, true, profile);
  assert.equal(on.finalOvr, off.finalOvr);
});

test('the drill level / intensity conflation is reported as unresolved, not modelled away', () => {
  const result = projectDrillAction({ player: player(), drillNames: ['Touch Training'], cycles: 10, profile });
  const flag = result.reasons.find(r => r.code === 'drill.levelVsIntensity');
  assert.ok(flag, 'the uncalibrated intensity→training-effect mapping must be surfaced');
  assert.equal(flag!.evidence, 'assumed');
});

// ─────────────────────────────────────────────────────────────────────────────
// Absolute star bands. A threshold sits at a fixed multiple of the star OVR
// step in BASE OVR — not at +20 from wherever a projection started.
// ─────────────────────────────────────────────────────────────────────────────

import { projectDrillAction as drillAction } from '../src/logic/recommendation';
import { applyDrillSessionsToStats } from '../src/logic/ovrProjector';
import { starBandIndex, tierOvrContrib, tierOvrContribExact } from '../src/engine/engineMath';
import { getWhiteStatKeys } from '../src/utils/roleWeights';

const flatStats = (v: number) => Object.fromEntries(Object.keys(OUTFIELD).map(k => [k, v]));
const withOverall = (stats: Record<string, number>, over: Partial<Player> = {}): Player =>
  player({ stats, overall: Math.floor(Object.values(stats).reduce((a, b) => a + b, 0) / 15), ...over });

/** Base OVR 159.6 — four tenths short of the 160 boundary. */
const nearBoundary = () => {
  const s = flatStats(159);
  s.TACKLING = 168;                       // sum 2394 → 159.6
  return withOverall(s);
};
/** Base OVR 150.0 — ten clear of the next boundary. */
const midBand = () => withOverall(flatStats(150));

test('a player just short of a boundary crosses it on the remaining gain, not after a fresh 20', () => {
  const near = projectCoachAction({ player: nearBoundary(), stats: STATS, sessions: 6, profile });
  assert.equal(near.starBand.index, starBandIndex(159.6));
  assert.ok(Math.abs(near.starBand.ovrToNextThreshold - 0.4) < 0.01,
    `0.4 OVR to the threshold, got ${near.starBand.ovrToNextThreshold}`);
  assert.ok(near.reasons.some(r => r.code === 'training.starDecay'),
    'a small gain from 159.6 must cross 160 and be charged the reduced rate');

  // The remainder is genuinely charged at the harder rate: the same action on a
  // player mid-band, with the same stat values in play, gains more.
  const mid = projectCoachAction({ player: midBand(), stats: STATS, sessions: 6, profile });
  assert.equal(mid.reasons.some(r => r.code === 'training.starDecay'), false);
  assert.ok(near.ovrDelta < mid.ovrDelta,
    `crossing run (+${near.ovrDelta}) must gain less than the non-crossing run (+${mid.ovrDelta})`);
});

test('a player safely inside a band receives no star decay', () => {
  const mid = projectCoachAction({ player: midBand(), stats: STATS, sessions: 6, profile });
  assert.equal(mid.starBand.ovrToNextThreshold, 10);
  assert.equal(mid.reasons.some(r => r.code === 'training.starDecay'), false);
  // and matches the plain un-decayed gain exactly
  const expected = estimateStatGainPct(coachBudgetPerStat(6, STATS), 150, 20, 0, 'Normal', true, false, 1.0, profile);
  assert.equal(mid.statDeltas.find(d => d.stat === 'TACKLING')!.delta, Number(expected.toFixed(1)));
});

test('tier-inflated stats keep their full value as the XP cost input', () => {
  // A heavily tiered white stat is genuinely expensive: the cost curve is indexed
  // on the ACTUAL value, tier included. Tier is never subtracted before costing.
  const tiered = withOverall({ ...flatStats(120), TACKLING: 400 }, { tier: 'T4' });

  // At a realistic session count the 400 stat projects nothing at all, while the
  // low stats on the SAME player still move — the observed pattern on a heavily
  // tiered card.
  const modest = projectCoachAction({ player: tiered, stats: STATS, sessions: 4, profile });
  assert.equal(modest.statDeltas.some(d => d.stat === 'TACKLING'), false,
    'a 400 stat must project +0 at a normal session count');
  assert.ok(modest.statDeltas.find(d => d.stat === 'MARKING')!.delta > 0,
    'a 120 stat on the same player stays trainable');

  // The value itself is never rebased: the cost curve is indexed on 400, not on
  // 400 minus the tier addition.
  const heavy = projectCoachAction({ player: tiered, stats: ['TACKLING', 'MARKING'], sessions: 40, profile });
  const at400 = heavy.statDeltas.find(d => d.stat === 'TACKLING')?.delta ?? 0;
  const at120 = heavy.statDeltas.find(d => d.stat === 'MARKING')!.delta;
  assert.ok(at400 < at120 / 20, `the 400 stat (+${at400}) must gain far less than the 120 stat (+${at120})`);
  assert.ok(heavy.projectedStats.TACKLING >= 400, 'the 400 value is preserved, not rebased');
});

test('equal star position with different tier-added stats: same boundary, different per-stat cost', () => {
  // Two players at the same base (star-quality) OVR. One carries tier additions
  // on its white stats, so each further point costs more — but the tier does NOT
  // move where the star boundary sits.
  const plain = withOverall(flatStats(150));
  const whites = getWhiteStatKeys(plain.role);
  const bumped = { ...flatStats(150) };
  for (const k of whites) bumped[k] += 50;                       // T3 additions
  const tiered = withOverall(bumped, { tier: 'T3' });

  const a = projectCoachAction({ player: plain, stats: STATS, sessions: 40, profile });
  const b = projectCoachAction({ player: tiered, stats: STATS, sessions: 40, profile });

  // Same underlying band: the tier contribution is removed from OVR before the
  // band is read, so tier does not buy or cost star progress.
  assert.equal(b.starBand.index, a.starBand.index);
  assert.ok(tierOvrContrib('T3', whites.length) > 0, 'the tiered player really does carry a tier OVR contribution');

  // But every tiered white stat is more expensive to train.
  for (const stat of STATS.filter(s => whites.includes(s))) {
    const plainGain = a.statDeltas.find(d => d.stat === stat)!.delta;
    const tieredGain = b.statDeltas.find(d => d.stat === stat)!.delta;
    assert.ok(tieredGain < plainGain,
      `${stat}: tiered (+${tieredGain}) must gain less than untiered (+${plainGain})`);
  }
});

test('projected stat progress stays fractional', () => {
  const result = projectCoachAction({ player: midBand(), stats: ['TACKLING'], sessions: 4, profile });
  const value = result.projectedStats.TACKLING;
  assert.ok(value > 150);
  assert.equal(Number.isInteger(value), false, 'sub-integer progress must survive the projection');
});

test('an unobserved starting fraction is reported as a lower bound, never as a known zero', () => {
  // Card-scanned integers: the hidden fraction is unknown, so the distance to the
  // next threshold is an upper bound and the projection says so.
  const scanned = projectCoachAction({ player: midBand(), stats: STATS, sessions: 4, profile });
  assert.equal(scanned.starBand.positionEvidence, 'lower-bound');
  const flag = scanned.reasons.find(r => r.code === 'training.hiddenProgress');
  assert.ok(flag, 'the unobserved fraction must be surfaced');
  assert.equal(flag!.evidence, 'unavailable');
});

test('a model-generated fraction does NOT upgrade the evidence to exact', () => {
  // REGRESSION GUARD against uncertainty laundering.
  //
  // This test previously asserted the opposite — that stats carrying decimals
  // were "known exactly". They are not. A decimal here was produced by our own
  // projection, and a model-generated fraction is not an observation. The true
  // position is (s + ε) + g against our estimate s + g: the error is still ε.
  // Adding a known gain to an unknown baseline cannot reduce the uncertainty.
  const advanced = withOverall({ ...flatStats(150), TACKLING: 150.4 });
  const known = projectCoachAction({ player: advanced, stats: STATS, sessions: 4, profile });
  assert.equal(known.starBand.positionEvidence, 'lower-bound',
    'a decimal proves only that our model produced it, never that the position is known');
  assert.ok(known.reasons.some(r => r.code === 'training.hiddenProgress'),
    'the hidden-fraction caveat must survive the projection that created the decimal');
});

test('an incomplete stat set abstains: padding cannot locate a star threshold', () => {
  // paddedStatSum substitutes the player's overall for every unread attribute.
  // That is a fair coarse display fallback, but a band position computed from
  // invented values is not a bound in either direction — the real player may sit
  // on either side of the threshold — so the position abstains outright.
  const partial = player({ stats: { TACKLING: 150, MARKING: 150, POSITIONING: 150 }, overall: 150 });
  const r = projectCoachAction({ player: partial, stats: STATS, sessions: 4, profile });
  assert.equal(r.starBand.positionEvidence, 'unknown');
  const flag = r.reasons.find(r2 => r2.code === 'training.paddedPosition');
  assert.ok(flag, 'padding-derived positions must say so');
  assert.equal(flag!.evidence, 'unavailable');
  // And it must NOT masquerade as the merely-hidden-fraction case, which is a
  // genuine one-sided bound; this one is not a bound at all.
  assert.equal(r.reasons.some(r2 => r2.code === 'training.hiddenProgress'), false);
});

test('the star-decay reason is graded assumed, matching engineConstants', () => {
  // engineConstants records starDecayPerSession = 0.85 as a model characteristic
  // with empirical confirmation PENDING. Observing that training gets harder past
  // a star establishes the sign of the effect, not the numerical factor, so the
  // reason may not claim 'calibrated'.
  const near = projectCoachAction({ player: nearBoundary(), stats: STATS, sessions: 6, profile });
  const decay = near.reasons.find(r => r.code === 'training.starDecay');
  assert.ok(decay, 'crossing a threshold must be reported');
  assert.equal(decay!.evidence, 'assumed');
});

test('chained drill presets keep the star-band position across the chain', () => {
  // The Drills screen runs one action per preset, threading stats forward. The
  // second action must see the position the first one left, not restart mid-band.
  const start = nearBoundary();
  const first = drillAction({ player: start, drillNames: ['Touch Training'], cycles: 40, profile });
  const second = drillAction({
    player: { ...start, stats: first.projectedStats },
    drillNames: ['Touch Training'], cycles: 40, profile,
  });
  assert.ok(second.starBand.ovrToNextThreshold < first.starBand.ovrToNextThreshold + 20);
  assert.ok(second.starBand.index >= first.starBand.index,
    'the second preset must not fall back into an earlier band');
  // Progress carried forward is RELATIVE progress: the chain's own arithmetic is
  // sound, but the absolute position still sits on the unobserved starting
  // fraction, so the evidence grade must not improve along the chain.
  assert.equal(second.starBand.positionEvidence, 'lower-bound');
  assert.equal(first.starBand.positionEvidence, 'lower-bound');
});

test('a two-preset Drills chain agrees with the projectOvr path across a threshold', () => {
  const start = nearBoundary();
  const sessions: DrillSession[] = [
    { drillName: 'Touch Training', sessionCount: 40, drillLevel: 'Very Easy' },
    { drillName: 'Touch Training', sessionCount: 40, drillLevel: 'Very Easy' },
  ];
  const viaPlan = applyDrillSessionsToStats(start, sessions, 'Normal', false, profile);

  let stats = start.stats;
  for (let i = 0; i < 2; i++) {
    stats = drillAction({ player: { ...start, stats }, drillNames: ['Touch Training'], cycles: 40, profile }).projectedStats;
  }
  assert.deepEqual(stats, viaPlan.updatedStats,
    'the Drills chain and the plan path must produce identical progression');
});

test('a fractional tier contribution must not be floored into the band position', () => {
  // DC+DMC has 10 white stats; T3 adds +50 each, so the tier's OVR contribution
  // is 500/15 = 33.333…  Flooring it to 33 pushes the recovered base OVR up by
  // 0.333 — straight into the fraction the whole absolute-band model depends on.
  // A player at a genuine base of 159.8 then reads as 160.13 and is charged the
  // harder rate before reaching the boundary at all.
  const whites = getWhiteStatKeys(['DC', 'DMC']);
  assert.equal(whites.length, 10);
  const exact = tierOvrContribExact('T3', whites.length);
  assert.equal(exact, 500 / 15);
  assert.ok(!Number.isInteger(exact), 'this fixture is only meaningful with a fractional contribution');
  assert.equal(tierOvrContrib('T3', whites.length), 33);   // the display/lock value, unchanged

  // Build a tiered player whose genuine base OVR is exactly 159.8.
  for (const [genuineBase, expectedBand] of [[159.6, 7], [159.8, 7]] as const) {
    const target = genuineBase + exact;                     // required exact TOTAL ovr
    const stats = Object.fromEntries(Object.keys(OUTFIELD).map(k => [k, target]));
    const subject = player({ stats, tier: 'T3', role: ['DC', 'DMC'], overall: Math.floor(target) });

    const result = projectCoachAction({ player: subject, stats: STATS, sessions: 1, profile });
    assert.equal(result.starBand.index, expectedBand,
      `base ${genuineBase} sits in band ${expectedBand}, not ${result.starBand.index}`);
    // The distance must be exact, not off by the floor residue.
    assert.ok(Math.abs(result.starBand.ovrToNextThreshold - (160 - genuineBase)) < 1e-9,
      `base ${genuineBase} is ${(160 - genuineBase).toFixed(2)} from the boundary, ` +
      `reported ${result.starBand.ovrToNextThreshold}`);
  }

  // The untiered control lands identically — tier changes cost, never position.
  const plainStats = Object.fromEntries(Object.keys(OUTFIELD).map(k => [k, 159.8]));
  const plain = projectCoachAction({
    player: player({ stats: plainStats, tier: 'T0', role: ['DC', 'DMC'], overall: 159 }),
    stats: STATS, sessions: 1, profile,
  });
  assert.equal(plain.starBand.index, 7);
  assert.ok(Math.abs(plain.starBand.ovrToNextThreshold - 0.2) < 1e-9);
});
