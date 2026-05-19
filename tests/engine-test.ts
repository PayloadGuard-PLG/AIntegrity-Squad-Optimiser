import { estimateStatGainPct, xpNeededFor1Pct, xpBaseForStat, getAgeMultiplier } from '../src/logic/xpEngine';
import { applyTierBonusToStats } from '../src/logic/xpEngine';
import { calculateActualLoss } from '../src/utils/conditionEngine';
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

function assertClose(label: string, actual: number, expected: number, tolerance = 0.5) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`  ✓ ${label} (got ${actual.toFixed(3)}, expected ${expected})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label} — got ${actual.toFixed(3)}, expected ${expected} ± ${tolerance}`);
    failed++;
  }
}

function assertInRange(label: string, actual: number, lo: number, hi: number) {
  const ok = actual >= lo && actual <= hi;
  if (ok) {
    console.log(`  ✓ ${label} (got ${actual.toFixed(2)}, range ${lo}–${hi})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label} — got ${actual.toFixed(2)}, expected ${lo}–${hi}`);
    failed++;
  }
}

// ─── 1. xpBaseForStat — exponential model ───────────────────────────────────
{
  console.log('\n[1] xpBaseForStat: exponential cost curve (C₀=2.94, K=55)');
  // C₀ × exp(stat/K)
  const at0   = xpBaseForStat(0,   profile);
  const at55  = xpBaseForStat(55,  profile);
  const at110 = xpBaseForStat(110, profile);
  assertClose('stat=0 → 2.94',        at0,   2.94,   0.01);
  assertClose('stat=55 → 2.94×e ≈ 7.99', at55, 2.94 * Math.E, 0.02);
  assertClose('stat=110 → 2.94×e² ≈ 21.72', at110, 2.94 * Math.E * Math.E, 0.05);
  // Ratio: exp((228-120)/55) ≈ 4.89 — the calibration derivation point
  const ratio = xpBaseForStat(228, profile) / xpBaseForStat(120, profile);
  assertClose('cost ratio stat228/stat120 = exp(108/55) ≈ 4.89', ratio, Math.exp(108 / 55), 0.05);
}

// ─── 2. getAgeMultiplier — table lookups ─────────────────────────────────────
{
  console.log('\n[2] getAgeMultiplier: confirmed and assumed brackets');
  // Confirmed from game data
  assertClose('age 18 → 1.00 (confirmed)',  getAgeMultiplier(18, profile), 1.00, 0.001);
  assertClose('age 20 → 1.00 (confirmed)',  getAgeMultiplier(20, profile), 1.00, 0.001);
  assertClose('age 27 → 0.61 (confirmed)',  getAgeMultiplier(27, profile), 0.61, 0.001);
  // Assumed — mark these so failures are visible
  assertClose('age 22 → 0.85 (ASSUMED — validate with Prentice run)', getAgeMultiplier(22, profile), 0.85, 0.001);
  assertClose('age 24 → 0.72 (ASSUMED — validate with age-24 DMC scan)', getAgeMultiplier(24, profile), 0.72, 0.001);
  assertClose('age 29 → 0.50 (ASSUMED)',    getAgeMultiplier(29, profile), 0.50, 0.001);
  assertClose('age 30 → 0.00 (ASSUMED)',    getAgeMultiplier(30, profile), 0.00, 0.001);
}

// ─── 3. xpNeededFor1Pct — formula: base / (ageMult × talentMult × greyMult) ─
{
  console.log('\n[3] xpNeededFor1Pct: divisor composition');
  const base120 = xpBaseForStat(120, profile);
  // Normal, age 20, white — divisor = 1.0 × 1.0 × 1.0 = 1.0
  const costWhite = xpNeededFor1Pct(120, 20, 0, 'Normal', true,  false, 1.0, profile);
  // Normal, age 20, grey  — divisor = 1.0 × 1.0 × 0.5 = 0.5 → cost doubles
  const costGrey  = xpNeededFor1Pct(120, 20, 0, 'Normal', false, false, 1.0, profile);
  assertClose('white cost = base/1.0',      costWhite, base120,       0.01);
  assertClose('grey cost = 2 × white cost', costGrey,  base120 / 0.5, 0.01);
  assert('grey costs exactly 2× white', Math.abs(costGrey / costWhite - 2.0) < 0.001);

  // Age multiplier: age 27 (0.61) costs more than age 20 (1.0)
  const cost27 = xpNeededFor1Pct(120, 27, 0, 'Normal', true, false, 1.0, profile);
  const cost20 = xpNeededFor1Pct(120, 20, 0, 'Normal', true, false, 1.0, profile);
  assertClose('age-27 cost / age-20 cost = 1.0/0.61 ≈ 1.639', cost27 / cost20, 1.0 / 0.61, 0.01);

  // Slow talent (0.47) costs more than Normal (1.0)
  const costSlow   = xpNeededFor1Pct(120, 20, 0, 'Slow',   true, false, 1.0, profile);
  const costNormal = xpNeededFor1Pct(120, 20, 0, 'Normal', true, false, 1.0, profile);
  assertClose('Slow cost / Normal cost = 1.0/0.47 ≈ 2.128', costSlow / costNormal, 1.0 / 0.47, 0.01);
}

// ─── 4. estimateStatGainPct — calibrated observations (player-agnostic) ──────
//
// Each case is stated as pure inputs (budget, statValue, age, talent, isWhite)
// and the observed game range from a real session. The engine must land inside
// or close to the observed range. No player name needed — only the numbers matter.
//
// Source: calibration_data.json (back-calculated from game screenshots).
{
  console.log('\n[4] estimateStatGainPct: calibrated game observations');

  // Observation A: bXPS=450 calibration point
  // budget=360 (4 sessions, 5 stats), stat=139, age=23, Normal, white
  // Game observed: +11–16 (Standard Safeguard ×4)
  const gainA = estimateStatGainPct(360, 139, 23, 0, 'Normal', true, false, 1.0, profile);
  assertInRange('Obs A: budget=360 stat=139 age=23 Normal white → +11–16', gainA, 11, 16);

  // Observation B: high-stat cost curve
  // budget=360, stat=194, age=23, Normal, white
  // Game observed: +4–6
  const gainB = estimateStatGainPct(360, 194, 23, 0, 'Normal', true, false, 1.0, profile);
  assertInRange('Obs B: budget=360 stat=194 age=23 Normal white → +4–6', gainB, 4, 6);

  // Observation C: grey stat costs 2× — same budget at same stat must give ~half the gain
  // grey at stat=139 age=23 Normal should be roughly half of white gain
  const gainC_white = estimateStatGainPct(360, 139, 23, 0, 'Normal', true,  false, 1.0, profile);
  const gainC_grey  = estimateStatGainPct(360, 139, 23, 0, 'Normal', false, false, 1.0, profile);
  assert('grey gain < white gain for same inputs', gainC_grey < gainC_white);
  assertClose('grey/white ratio ≈ 0.5 (not exact due to compounding)', gainC_grey / gainC_white, 0.5, 0.08);

  // Observation D: Slow talent must gain less than Normal from same inputs.
  // The ratio of GAINS is not equal to the ratio of multipliers (0.47) because
  // the cost curve compounds: Normal gains more points, reaching higher (costlier)
  // stat values, so the effective cost per point averaged over the session is higher.
  // Correct assertion: Slow gain < Normal gain, and ratio is > 0.47 (not equal to it).
  const gainD_normal = estimateStatGainPct(600, 120, 20, 0, 'Normal', true, false, 1.0, profile);
  const gainD_slow   = estimateStatGainPct(600, 120, 20, 0, 'Slow',   true, false, 1.0, profile);
  assert('Slow gains less than Normal (same inputs)',          gainD_slow < gainD_normal);
  assert('Slow/Normal ratio > 0.47 (cost curve compounds)',   gainD_slow / gainD_normal > 0.47);
  assert('Slow/Normal ratio < 0.65 (not too far above 0.47)', gainD_slow / gainD_normal < 0.65);

  // Observations E and F are pending real game data.
  // The app showed +15.4 MARKING and +11.6 AGGRESSION for Prentice's Reward Coach ×4,
  // but those are the engine's own output — not game-observed results. They cannot
  // validate bXPS or ageMult. Replace these once before/after player card screenshots
  // confirm actual stat gains from the session.
  console.log('  [PENDING] Obs E/F: Prentice Reward Coach ×4 — needs game before/after data');
}

// ─── 5. Tier bonus ───────────────────────────────────────────────────────────
{
  console.log('\n[5] applyTierBonusToStats');
  const roleKeys = ['TACKLING', 'MARKING'];
  const stats = { TACKLING: 100, MARKING: 80, HEADING: 40 };

  const result = applyTierBonusToStats(stats, roleKeys, 'T6', profile, 'T0');
  assert('T0→T6 adds 160 to TACKLING (role stat)',   result['TACKLING'] === 260);
  assert('T0→T6 adds 160 to MARKING (role stat)',    result['MARKING']  === 240);
  assert('T0→T6 leaves HEADING unchanged (off-role)', result['HEADING']  === 40);

  // Incremental: T2→T3 adds 20 (not 50)
  const incResult = applyTierBonusToStats(stats, roleKeys, 'T3', profile, 'T2');
  assert('T2→T3 adds 20 to TACKLING', incResult['TACKLING'] === 120);
  assert('T2→T3 leaves HEADING unchanged', incResult['HEADING'] === 40);
}

// ─── 6. Condition drain ──────────────────────────────────────────────────────
{
  console.log('\n[6] Condition drain (confirmed from screenshots)');
  const baseLoss = 0.75;
  assertClose('Very Easy L4 = 0.375 (zero-drain eligible)', calculateActualLoss(baseLoss, 4, 'Very Easy'), 0.375, 0.001);
  assertClose('Easy L4 = 0.750',       calculateActualLoss(baseLoss, 4, 'Easy'),     0.750, 0.001);
  assertClose('Very Hard L0 = 3.375',  calculateActualLoss(baseLoss, 0, 'Very Hard'), 3.375, 0.001);
  assert('Very Easy L4 < zero-drain threshold (0.38)', calculateActualLoss(baseLoss, 4, 'Very Easy') < 0.38);
  assert('Easy L4 >= zero-drain threshold',             calculateActualLoss(baseLoss, 4, 'Easy') >= 0.38);
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---\n`);
if (failed > 0) process.exit(1);
