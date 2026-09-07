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
  conditionReduction, rawDrillDrain, chargedDrainRange,
  sessionDrain, MIN_CONDITION_DRAIN_PCT,
} from '../src/utils/conditionEngine';
import { findSubFloorBundle, bundlingStatus } from '../src/logic/zeroDrainEngine';
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

console.log('\n[3] Charged drain is a RANGE, not a point');
{
  // Observed: the same 3-drill preset (raw 6.00) charged 5, 6 and 7 across n=19.
  const r = chargedDrainRange(6.00, 3);
  close(r.raw, 6.00, 'raw is deterministic and matches the pre-confirm dialog');
  close(r.expected, 6, 'expected charge is the centre, 6% — the observed mean was 6.16');
  ok(r.low <= 5 && r.high >= 7, 'envelope covers every observed value 5-7',
    `got ${r.low}-${r.high}`);
  ok(r.confidence === 'observed-envelope', 'envelope is labelled as observed, not derived');

  // Minimum still holds: nothing is ever free.
  const tiny = chargedDrainRange(0.375, 1);
  ok(tiny.low >= MIN_CONDITION_DRAIN_PCT, 'sub-1% raw never charges below the 1% minimum');
  ok(tiny.expected >= MIN_CONDITION_DRAIN_PCT, 'and its expectation is the minimum, not the raw');
  close(chargedDrainRange(0, 0).expected, 0, 'no drills = no charge');

  // The envelope widens with DRILL COUNT, not with raw. Two Very Easy drills and
  // one Easy drill have the same raw 1.50 but were not observed to behave alike.
  const oneDrill = chargedDrainRange(1.50, 1);
  const twoDrills = chargedDrainRange(1.50, 2);
  ok(twoDrills.high > oneDrill.high, 'same raw, more drills = wider envelope',
    `1 drill ${oneDrill.low}-${oneDrill.high}, 2 drills ${twoDrills.low}-${twoDrills.high}`);
  close(twoDrills.expected, oneDrill.expected, 'but the same expectation — raw is unchanged');
}

console.log('\n[4] Raw is still deterministic and surge-driven');
close(rawDrillDrain(0.75, 'Medium', SURGE_STATE_SEASON_START), 2.25,
  'observed: lone Medium pre-confirm reads -2.25%');
{
  const three = sessionDrain([
    { baseLoss: 0.75, intensity: 'Easy' },
    { baseLoss: 0.75, intensity: 'Medium' },
    { baseLoss: 0.75, intensity: 'Medium' },
  ], SURGE_STATE_SEASON_START);
  close(three.raw, 6.00, 'observed: Easy+Medium+Medium pre-confirm reads -6%');
  ok(three.charge.low <= 5 && three.charge.high >= 7,
    'its charge envelope spans the observed 5-7%', `got ${three.charge.low}-${three.charge.high}`);

  // The tightest raw confirmation available: six drills across three intensities.
  // 1.5 + 2.25 + 2.25 + 1.5 + 2.25 + 3.0 = 12.75, matching the dialog exactly.
  // This pins baseLoss=0.75 and the Easy/Medium/Hard multipliers 2/3/4 together.
  const six = sessionDrain([
    { baseLoss: 0.75, intensity: 'Easy' },
    { baseLoss: 0.75, intensity: 'Medium' },
    { baseLoss: 0.75, intensity: 'Medium' },
    { baseLoss: 0.75, intensity: 'Easy' },
    { baseLoss: 0.75, intensity: 'Medium' },
    { baseLoss: 0.75, intensity: 'Hard' },
  ], SURGE_STATE_SEASON_START);
  close(six.raw, 12.75, 'observed: 6-drill preset pre-confirm reads -12.75%');
  ok(six.charge.low <= 10 && six.charge.high >= 14,
    'its charge envelope spans the observed 10-14%', `got ${six.charge.low}-${six.charge.high}`);
  // Regression guard for the model this replaced: per-drill floor/ceil dithering
  // predicts [11..16] here, which excludes the observed -10.00% row.
  ok(six.charge.low < 11, 'the falsified per-drill floor/ceil band (11-16) is not what we ship',
    `low is ${six.charge.low}`);
}

console.log('\n[5] Zero-drain retired; bundling withheld rather than guessed');
ok(validateZeroDrain() === false, 'validateZeroDrain always false');
{
  const st = bundlingStatus();
  ok(st.available === false, 'bundling reports unavailable');
  ok(/not a deterministic function/.test(st.reason), 'and says why, in the reason string');
  for (const lvl of [0, 1, 2, 3, 4] as SurgeLevel[]) {
    ok(findSubFloorBundle(surge(true, lvl)) === null,
      `no bundle recommended at active L${lvl} — premise unproven`);
  }
  ok(isBundlingAvailable(surge(true, 4)) === false,
    'not even at L4: the deterministic premise it relied on is disproved');
}

console.log('\n' + '═'.repeat(60));
console.log(`  Results:  ${passed} passed  ·  ${failed} failed`);
console.log('═'.repeat(60) + '\n');
if (failed > 0) { fails.forEach(f => console.log(`  - ${f}`)); process.exitCode = 1; }
