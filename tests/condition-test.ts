/**
 * Condition model v2 — minimum charged drain, surge state, bundling.
 *
 *   npm run test:condition
 *
 * Every expected value here traces to a game observation, not to the old profile:
 *  - training history: single drills, surge inactive, charged -1.00%
 *  - fan club panel:   Perfect Conditions -10/-15/-20/-25/-50%, currently INACTIVE
 */
import {
  conditionReduction, rawDrillDrain, chargedDrain, calculateActualLoss,
  sessionDrain, MIN_CONDITION_DRAIN_PCT,
} from '../src/utils/conditionEngine';
import { findSubFloorBundle } from '../src/logic/zeroDrainEngine';
import { isBundlingAvailable, validateZeroDrain } from '../src/logic/zeroDrainProtocol';
import { SurgeState, SURGE_STATE_SEASON_START, SurgeLevel } from '../src/types/resources';

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(c: boolean, label: string, detail?: string) {
  if (c) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; fails.push(label); console.log(`  ✗ FAIL: ${label}${detail ? `\n      ${detail}` : ''}`); }
}
function close(a: number, b: number, label: string, eps = 1e-9) {
  ok(Math.abs(a - b) < eps, label, `expected ${b}, got ${a}`);
}
const surge = (active: boolean, level: SurgeLevel): SurgeState =>
  ({ perfectConditionsActive: active, perfectConditionsLevel: level });

console.log('\n' + '═'.repeat(60));
console.log('  CONDITION MODEL v2');
console.log('═'.repeat(60));

console.log('\n[1] Surge gating — an inactive surge grants nothing');
close(conditionReduction(SURGE_STATE_SEASON_START), 0, 'season start: reduction is 0');
close(conditionReduction(surge(false, 4)), 0, 'inactive at L4: still 0 (level banked, not applied)');
close(conditionReduction(surge(true, 0)), 0.10, 'active L0: -10%');
close(conditionReduction(surge(true, 4)), 0.50, 'active L4: -50%');

console.log('\n[2] Raw drain matches the fan club panel semantics');
close(rawDrillDrain(0.75, 'Very Easy', SURGE_STATE_SEASON_START), 0.750, 'VE, surge off  = 0.750%');
close(rawDrillDrain(0.75, 'Very Easy', surge(true, 0)), 0.675, 'VE, active L0  = 0.675%');
close(rawDrillDrain(0.75, 'Very Easy', surge(true, 4)), 0.375, 'VE, active L4  = 0.375%');
close(rawDrillDrain(0.75, 'Very Hard', surge(true, 4)), 1.875, 'VH, active L4  = 1.875%');
// The unit bug this replaces produced 0.74625 for VE at L4 by dividing 0.5 by 100.
ok(Math.abs(rawDrillDrain(0.75, 'Very Easy', surge(true, 4)) - 0.74625) > 0.1,
  'reduction is a fraction, not a percentage (no /100 bug)');

console.log('\n[3] Minimum charged drain — the patched loophole');
close(MIN_CONDITION_DRAIN_PCT, 1.0, 'floor is 1.00%');
close(calculateActualLoss(0.75, 'Very Easy', SURGE_STATE_SEASON_START), 1.00,
  'observed: single VE at season start is charged -1.00%');
close(calculateActualLoss(0.75, 'Very Easy', surge(true, 4)), 1.00,
  'a cheaper 0.375% drill still costs 1.00% — sub-floor is penalised, not rewarded');
close(calculateActualLoss(0.75, 'Very Hard', SURGE_STATE_SEASON_START), 3.00,
  'Very Hard raw 3.75% is charged 3.00% — the fraction is truncated, not paid');
close(calculateActualLoss(0.75, 'Medium', SURGE_STATE_SEASON_START), 2.00,
  'observed: Medium raw 2.25% is charged -2.00%');
close(calculateActualLoss(0.75, 'Easy', SURGE_STATE_SEASON_START), 1.00,
  'observed: Easy raw 1.50% is charged -1.00%');
ok(calculateActualLoss(0.75, 'Easy', SURGE_STATE_SEASON_START)
   === calculateActualLoss(0.75, 'Very Easy', SURGE_STATE_SEASON_START),
  'Easy and Very Easy cost the SAME charged 1.00% — Very Easy is strictly dominated');
close(chargedDrain(0), 0, 'no drills = no charge');
ok(calculateActualLoss(0.75, 'Very Easy', surge(true, 4)) > 0, 'no drill is ever free');

console.log('\n[4] Zero-drain is retired, not merely renamed');
ok(validateZeroDrain() === false, 'validateZeroDrain always false');
ok(findSubFloorBundle(SURGE_STATE_SEASON_START) === null, 'no bundle at season start');
for (const lvl of [0, 1, 2, 3] as SurgeLevel[]) {
  ok(findSubFloorBundle(surge(true, lvl)) === null, `no bundle at active L${lvl}`);
}
ok(isBundlingAvailable(surge(true, 4)), 'bundling available only at active L4');

console.log('\n[5] Bundling reports BOTH floor readings, never one');
{
  const b = findSubFloorBundle(surge(true, 4));
  ok(b !== null && b.intensities.length === 2, '2 Very Easy drills fit under the floor at L4',
    `got ${b ? b.intensities.length : 'null'}`);
  if (b) {
    close(b.rawTotal, 0.75, 'raw total 0.750% < 1.00%');
    close(b.chargedPerSession, 1.00, 'if the floor is per session: 1.00%');
    close(b.chargedPerDrill, 2.00, 'if the floor is per drill: 2.00%');
    ok(b.chargedPerSession !== b.chargedPerDrill,
      'the two readings differ — caller must treat this as unsettled');
  }
}

console.log('\n[6] sessionDrain flags the unresolved aggregation rule');
{
  const two = [
    { baseLoss: 0.75, intensity: 'Very Easy' },
    { baseLoss: 0.75, intensity: 'Very Easy' },
  ];
  const off = sessionDrain(two, SURGE_STATE_SEASON_START);
  close(off.raw, 1.50, 'season start, 2x VE: raw 1.500%');
  close(off.chargedPerSession, 1.00, '  per-session reading 1.00% (floor of 1.500)');
  close(off.chargedPerDrill, 2.00, '  per-drill reading 2.00%');
  ok(off.floorRule === 'ambiguous', '  flagged ambiguous — this is the experiment to run');

  const one = sessionDrain([{ baseLoss: 0.75, intensity: 'Very Hard' }], SURGE_STATE_SEASON_START);
  ok(one.floorRule === 'settled', 'single drill: both readings agree, settled');
}

console.log('\n' + '═'.repeat(60));
console.log(`  Results:  ${passed} passed  ·  ${failed} failed`);
console.log('═'.repeat(60) + '\n');
if (failed > 0) { fails.forEach(f => console.log(`  - ${f}`)); process.exitCode = 1; }
