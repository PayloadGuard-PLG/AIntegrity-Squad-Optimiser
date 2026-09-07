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
import { coachBudgetPerStat } from '../src/engine/engineMath';
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
  });
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
