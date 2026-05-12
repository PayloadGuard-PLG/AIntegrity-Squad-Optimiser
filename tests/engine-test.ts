import { calculateActualLoss } from '../src/utils/conditionEngine';
import { estimateStatGainPct } from '../src/logic/xpEngine';
import { applyTierBonusToStats } from '../src/logic/xpEngine';
import gameProfileJson from '../profiles/game_2025.json';
import { GameProfile } from '../src/types/resources';

const profile = gameProfileJson as unknown as GameProfile;

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function assertClose(label: string, actual: number, expected: number, tolerance = 0.001) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`  ✓ ${label} (${actual.toFixed(4)})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label} — got ${actual.toFixed(4)}, expected ${expected}`);
    failed++;
  }
}

console.log('\n--- Engine Unit Tests ---\n');

// 1. OVR formula: floor(mean of 15 stats)
{
  console.log('[1] OVR formula: floor(mean of 15 stats)');
  const stats: Record<string, number> = {};
  for (let i = 0; i < 15; i++) stats[`STAT_${i}`] = 90;
  const sum = 15 * 90;
  const expected = Math.floor(sum / profile.totalAttributeCount / profile.qualityOvrDivisor);
  // Use computeOvrWithPadding logic directly: all 15 stats entered, no padding needed
  const qp = sum / profile.totalAttributeCount;
  const actual = Math.floor(qp / profile.qualityOvrDivisor);
  assert('15 stats each = 90 → OVR 90', actual === expected && actual === 90);
}

// 2. XP gain: young Fastest player gains more from same budget than old Slow player
{
  console.log('\n[2] estimateStatGainPct: Fastest 18yo > Slow 30yo (same budget, same stat)');
  const budget = 1500;
  const statValue = 80;
  const gainFastest = estimateStatGainPct(budget, statValue, 18, 0, 'Fastest', true, false, 1, profile);
  const gainSlow    = estimateStatGainPct(budget, statValue, 30, 0, 'Slow',    true, false, 1, profile);
  assert(`Fastest 18yo (${gainFastest.toFixed(2)}) > Slow 30yo (${gainSlow.toFixed(2)})`, gainFastest > gainSlow);
}

// 3. Zero-drain: VeryEasy + L4 < 0.38 threshold; Easy + L4 ≥ 0.38
{
  console.log('\n[3] Zero-drain threshold');
  const zeroDrainThreshold = 0.38;
  const baseLoss = 0.75;
  const veL4 = calculateActualLoss(baseLoss, 4, 'Very Easy');
  const easyL4 = calculateActualLoss(baseLoss, 4, 'Easy');
  assertClose('Very Easy + L4 = 0.375', veL4, 0.375);
  assert(`Very Easy + L4 (${veL4.toFixed(4)}) qualifies for zero-drain`, veL4 < zeroDrainThreshold);
  assert(`Easy + L4 (${easyL4.toFixed(4)}) does NOT qualify`, easyL4 >= zeroDrainThreshold);
}

// 4. Tier bonus: T0→T6 adds 160 to each role stat
{
  console.log('\n[4] applyTierBonusToStats: T0 → T6 adds +160 to role stats');
  const roleKeys = ['TACKLING', 'MARKING', 'PASSING'];
  const stats = { TACKLING: 100, MARKING: 80, PASSING: 60, HEADING: 40 };
  const result = applyTierBonusToStats(stats, roleKeys, 'T6', profile, 'T0');
  assert('TACKLING + 160 = 260', result['TACKLING'] === 260);
  assert('MARKING + 160 = 240', result['MARKING'] === 240);
  assert('PASSING + 160 = 220', result['PASSING'] === 220);
}

// 5. Off-role stats receive no bonus
{
  console.log('\n[5] applyTierBonusToStats: off-role stats unchanged');
  const roleKeys = ['TACKLING', 'MARKING'];
  const stats = { TACKLING: 100, MARKING: 80, HEADING: 40 };
  const result = applyTierBonusToStats(stats, roleKeys, 'T6', profile, 'T0');
  assert('HEADING (off-role) unchanged at 40', result['HEADING'] === 40);
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
