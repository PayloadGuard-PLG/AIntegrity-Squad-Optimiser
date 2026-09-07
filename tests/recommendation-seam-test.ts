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
