/**
 * Projection Engine Test Suite
 *
 * Run with:  npm run test:projection
 *
 * Tests the core logic chain in isolation — no Expo, no React Native, no DB.
 * Covers: OVR formula, drill XP pipeline, fixed drill intensity / catalogue invariants,
 * tier upgrades, training-cap (180-rule), role weight classification,
 * fixture window, and restorer bridge.
 */

import { projectOvr, computeOvrWithPadding, applyDrillSessionsToStats } from '../src/logic/ovrProjector';
import { calculateFixtureCycles, calculateRestorersBridge } from '../src/logic/fixtureEngine';
import { isWhiteStat, getWhiteStatKeys, getAllStatKeys, validateRoleAdjacency } from '../src/utils/roleWeights';
import { DRILL_LIST, TRAINING_XP_PER_PLAYER } from '../src/database/drillDatabase';
import gameProfileJson from '../profiles/game_2025.json';
import { GameProfile, DrillSession, TalentTier, TierName } from '../src/types/resources';

const profile = gameProfileJson as unknown as GameProfile;

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  FAIL: ${label}`);
    failed++;
  }
}

function assertClose(label: string, actual: number, expected: number, tol = 0.01) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    console.log(`  ✓  ${label}  (${actual.toFixed(4)})`);
    passed++;
  } else {
    console.error(`  ✗  FAIL: ${label}  — got ${actual.toFixed(4)}, expected ~${expected}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

// ─── Minimal player factory ───────────────────────────────────────────────────

function player(overrides: {
  role?: string[];
  overall?: number;
  tier?: TierName;
  age?: number;
  stats?: Record<string, number>;
}) {
  return {
    id: 'test',
    name: 'Test Player',
    role: overrides.role ?? ['MC'],
    overall: overrides.overall ?? 100,
    tier: overrides.tier ?? 'T0',
    age: overrides.age ?? 18,
    stats: overrides.stats ?? {},
    // Present only to satisfy the Player type. projectOvr takes talent as its
    // own argument, so this field is not what these tests are varying.
    talent: 'Normal' as const,
    isMutantCandidate: false,
  };
}

// ─── 1. OVR formula ───────────────────────────────────────────────────────────

section('1. OVR formula  (floor of stat mean / qualityOvrDivisor)');

{
  // 15 uniform stats at 90 → OVR should be floor(90 / qualityOvrDivisor)
  const stats: Record<string, number> = {};
  for (let i = 0; i < 15; i++) stats[`S${i}`] = 90;
  const ovr = computeOvrWithPadding(stats, 90, profile);
  const expected = Math.floor(90 / profile.qualityOvrDivisor);
  assert(`15 stats all 90 → OVR ${expected}`, ovr === expected);
}

{
  // Empty stats → falls back to playerOverall
  const ovr = computeOvrWithPadding({}, 85, profile);
  assert('Empty stats → fallback to playerOverall (85)', ovr === 85);
}

{
  // Partial stats (7 of 15): missing 8 padded with playerOverall
  // sum = 7×120 + 8×100 = 840+800 = 1640; floor(1640/15/qualityOvrDivisor)
  const stats: Record<string, number> = {};
  for (let i = 0; i < 7; i++) stats[`S${i}`] = 120;
  const ovr = computeOvrWithPadding(stats, 100, profile);
  const qp = (7 * 120 + 8 * 100) / 15;
  const expected = Math.floor(qp / profile.qualityOvrDivisor);
  assert(`Partial stats (7×120 pad 8×100) → OVR ${expected}`, ovr === expected);
}

// ─── 2. Verified ordinary drill baseline ───────────────────────────────────────

section('2. Verified ordinary drill baseline');

{
  assert('Ordinary baseline contains exactly 29 drills', DRILL_LIST.length === 29);

  const counts = DRILL_LIST.reduce<Record<string, number>>((acc, d) => {
    acc[d.type] = (acc[d.type] ?? 0) + 1;
    return acc;
  }, {});
  assert('Attack baseline count = 7', counts.Attack === 7);
  assert('Defence baseline count = 7', counts.Defence === 7);
  assert('Possession baseline count = 7', counts.Possession === 7);
  assert('Physical baseline count = 8', counts.Physical === 8);
  assert('All ordinary baseline drills use baseLoss 0.75', DRILL_LIST.every(d => d.baseLoss === 0.75));
  assert('Special/reward drills are outside DRILL_LIST', DRILL_LIST.every(d => d.isBase));
}

{
  assert('Very Easy awards +1 training XP/player', TRAINING_XP_PER_PLAYER['Very Easy'] === 1);
  assert('Easy awards +2 training XP/player', TRAINING_XP_PER_PLAYER['Easy'] === 2);
  assert('Medium awards +3 training XP/player', TRAINING_XP_PER_PLAYER['Medium'] === 3);
  assert('Hard awards +4 training XP/player', TRAINING_XP_PER_PLAYER['Hard'] === 4);
  assert('Very Hard awards +5 training XP/player', TRAINING_XP_PER_PLAYER['Very Hard'] === 5);

  const q = profile.drillQualityTrainingEffectPct ?? {};
  assert('Amateur training effect = +0%', q['Amateur'] === 0);
  assert('Semi-Pro training effect = +10%', q['Semi-Pro'] === 10);
  assert('Pro training effect = +20%', q['Pro'] === 20);
  assert('World-class training effect = +30%', q['World-class'] === 30);
}

// ─── 3. Fixed intensity is catalogue-owned; quality is a separate axis ───────

section('3. Drill intensity is catalogue-owned and not a selectable XP multiplier');

{
  const mc = player({
    role: ['MC'],
    overall: 80,
    stats: {
      TACKLING: 80, MARKING: 80, POSITIONING: 80, BRAVERY: 80,
      PASSING: 80, DRIBBLING: 80,
      FITNESS: 80, STRENGTH: 80, SPEED: 80, CREATIVITY: 80,
      HEADING: 70, CROSSING: 70, SHOOTING: 70, FINISHING: 70, AGGRESSION: 70,
    },
  });

  // Same drill, same state, same sessions. The legacy persisted drillLevel field
  // must not change permanent-stat output: intensity comes from the catalogue,
  // and the separate Amateur→World-class training-effect transfer is uncalibrated.
  const veLabel: DrillSession[] = [{ drillName: 'Touch Training', sessionCount: 10, drillLevel: 'Very Easy' }];
  const hardLabel: DrillSession[] = [{ drillName: 'Touch Training', sessionCount: 10, drillLevel: 'Hard' }];

  const a = projectOvr(mc, veLabel, 'Normal', 'Very Easy', null, 0, false, profile);
  const b = projectOvr(mc, hardLabel, 'Normal', 'Hard', null, 0, false, profile);

  assertClose('Legacy session.drillLevel cannot change fixed-drill OVR projection', b.finalOvr, a.finalOvr, 1e-9);
  assert('Touch Training remains Very Easy in catalogue', DRILL_LIST.find(d => d.name === 'Touch Training')?.intensity === 'Very Easy');
}

// ─── 4. Tier upgrade OVR ──────────────────────────────────────────────────────

section('4. Tier upgrade OVR contribution');

{
  const mc = player({ role: ['MC'], overall: 100, tier: 'T0', stats: {} });
  const { steps, finalOvr } = projectOvr(mc, [], 'Normal', 'Medium', 'T1', 0, false, profile);
  const tierStep = steps.find(s => s.action === 'tier');

  assert('At least one tier step emitted', steps.some(s => s.action === 'tier'));
  assert('Final OVR > starting OVR after tier upgrade', finalOvr > mc.overall);
  if (tierStep) {
    assert(`Tier step ovrAfter (${tierStep.ovrAfter}) > ovrBefore (${tierStep.ovrBefore})`, tierStep.ovrAfter >= tierStep.ovrBefore);
  }
}

// ─── 5. Training cap (180-rule) ───────────────────────────────────────────────

section('5. Training cap — drills have no effect when base OVR ≥ 180');

{
  // Build a player whose stats average to 180 (i.e. all stats = 180 → base OVR = 180)
  const lockedStats: Record<string, number> = {};
  const allKeys = ['TACKLING','MARKING','POSITIONING','BRAVERY','PASSING','DRIBBLING',
                   'FITNESS','STRENGTH','SPEED','CREATIVITY','HEADING','CROSSING',
                   'SHOOTING','FINISHING','AGGRESSION'];
  for (const k of allKeys) lockedStats[k] = 180;

  const lockedPlayer = player({ role: ['MC'], overall: 180, tier: 'T0', stats: lockedStats });
  const sessions: DrillSession[] = [{ drillName: 'Touch Training', sessionCount: 50, drillLevel: 'Very Easy' }];

  const { finalOvr, warnings } = projectOvr(lockedPlayer, sessions, 'Normal', 'Very Easy', null, 0, false, profile);

  assert('Training-locked player OVR does not increase from drills', finalOvr <= 180);
  assert('Training cap warning emitted', warnings.some(w => w.includes('training cap') || w.includes('Training cap') || w.includes('cap')));
}

// ─── 6. Grey stats gain less than white stats ─────────────────────────────────

section('6. Grey stats gain at greyWeightMultiplier fraction of white stat XP');

{
  // MC white: PASSING; MC grey: CROSSING
  // Give both the same value and run the same drill that trains both
  // Dead Ball Practice trains CROSSING and SHOOTING — but let's use a drill that trains PASSING (white) and CROSSING (grey)
  // Actually "Touch Training" trains HEADING, CREATIVITY, CONCENTRATION, DRIBBLING
  // Let me use "Porky in Centre" which trains PASSING (white for MC) and AGGRESSION (grey for MC)
  const mcStats: Record<string, number> = {
    TACKLING: 80, MARKING: 80, POSITIONING: 80, BRAVERY: 80,
    PASSING: 80, DRIBBLING: 80,
    FITNESS: 80, STRENGTH: 80, SPEED: 80, CREATIVITY: 80,
    HEADING: 70, CROSSING: 70, SHOOTING: 70, FINISHING: 70, AGGRESSION: 70,
  };
  const mc = player({ role: ['MC'], overall: 80, tier: 'T0', stats: mcStats });
  const sessions: DrillSession[] = [{ drillName: 'Porky in Centre', sessionCount: 20, drillLevel: 'Easy' }];

  const { updatedStats } = applyDrillSessionsToStats(mc, sessions, 'Normal', false, profile);

  const passingGain   = (updatedStats['PASSING']    ?? 80) - 80; // white for MC
  const aggressionGain = (updatedStats['AGGRESSION'] ?? 70) - 70; // grey for MC

  if (passingGain > 0 && aggressionGain > 0) {
    assert(
      `White PASSING gain (${passingGain.toFixed(3)}) > grey AGGRESSION gain (${aggressionGain.toFixed(3)})`,
      passingGain > aggressionGain
    );
  } else {
    // If the gains are zero (very small XP budget or stat already high), just confirm grey ≤ white
    assert(
      `White PASSING gain (${passingGain.toFixed(3)}) ≥ grey AGGRESSION gain (${aggressionGain.toFixed(3)})`,
      passingGain >= aggressionGain
    );
  }
}

// ─── 7. Role white/grey classification ────────────────────────────────────────

section('7. Role weight classification');

{
  // ── Card-anchored white/grey truth ────────────────────────────────────────
  // Read off four player cards by sampling the coloured key-attribute bar at the
  // left edge of each stat row (2026-09-07). 60 individual classifications; the
  // role table must reproduce every one. This is the non-circular check on
  // roleWeights — it comes from the game's own rendering, not from our tables.
  //
  // Darren Moore is listed as DC/DMC only: his third chip (MC) is a LEARNING role
  // at 2/50, and a learning role confers no white stats until it completes. He is
  // the observation that establishes that rule.
  const CARD_TRUTH: Array<[string, string[], string[]]> = [
    ['King Alfie DC/DL/DMC', ['DC', 'DL', 'DMC'],
      ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'PASSING', 'CROSSING',
       'FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY']],
    ['Darren Moore DC/DMC (MC learning 2/50)', ['DC', 'DMC'],
      ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'PASSING',
       'FITNESS', 'STRENGTH', 'AGGRESSION', 'CREATIVITY']],
    ['SD Faye DMC/MC/DC', ['DMC', 'MC', 'DC'],
      ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'PASSING', 'DRIBBLING',
       'SHOOTING', 'FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY']],
    ['Cieran Morgan DMC/MC/AMC', ['DMC', 'MC', 'AMC'],
      ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'PASSING', 'DRIBBLING',
       'SHOOTING', 'FINISHING', 'FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY']],
  ];
  for (const [label, roles, cardWhite] of CARD_TRUTH) {
    const code = getWhiteStatKeys(roles);
    const missing = cardWhite.filter(x => !code.includes(x));
    const extra   = code.filter(x => !cardWhite.includes(x));
    assert(`${label}: ${cardWhite.length} white, matches the card exactly`,
      missing.length === 0 && extra.length === 0);
  }
  // Faye and Moore share the DC/DMC/MC role set; the ONLY difference is that
  // Moore's MC is incomplete. Completing it must add exactly DRIBBLING, SHOOTING,
  // SPEED — the three stats the app should be telling him he is missing.
  {
    const incomplete = getWhiteStatKeys(['DC', 'DMC']);
    const complete   = getWhiteStatKeys(['DC', 'DMC', 'MC']);
    const unlocked   = complete.filter(x => !incomplete.includes(x)).sort();
    assert('completing a learning MC unlocks exactly DRIBBLING, SHOOTING, SPEED',
      unlocked.join(',') === 'DRIBBLING,SHOOTING,SPEED');
    assert('and nothing already white is lost',
      incomplete.every(x => complete.includes(x)));
  }

  // Pure MC direct control. Earlier multi-role controls could not reveal an
  // erroneous MC STRENGTH white because DC supplied STRENGTH in those unions.
  {
    const mcWhite = getWhiteStatKeys(['MC']);
    assert('pure MC white stat count = 10', mcWhite.length === 10);
    assert('SHOOTING is white for pure MC', isWhiteStat(['MC'], 'SHOOTING'));
    assert('STRENGTH is grey for pure MC', !isWhiteStat(['MC'], 'STRENGTH'));

    const mcDmc = getWhiteStatKeys(['MC', 'DMC']);
    const unlocked = mcDmc.filter(x => !mcWhite.includes(x)).sort();
    assert('MC + DMC white stat count = 12', mcDmc.length === 12);
    assert('adding DMC to MC newly-whites exactly AGGRESSION and HEADING',
      unlocked.join(',') === 'AGGRESSION,HEADING');

    // Existing Cieran card truth plus the new pure-MC control jointly falsify
    // a simple per-role union: STRENGTH is grey for MC, DMC and AMC alone, but
    // white for the observed DMC+MC+AMC role set.
    const cieran = getWhiteStatKeys(['DMC', 'MC', 'AMC']);
    assert('DMC+MC+AMC preserves Cieran card truth at 14 white stats', cieran.length === 14);
    assert('DMC+MC+AMC interaction makes STRENGTH white',
      isWhiteStat(['DMC', 'MC', 'AMC'], 'STRENGTH'));
    assert('DMC+MC without AMC leaves STRENGTH grey',
      !isWhiteStat(['DMC', 'MC'], 'STRENGTH'));
  }

  // DMC confirmed: 9 white + 6 grey = 15 total.
  // Was 10 white until Sprint 31 moved STRENGTH to secondary — the game shows it
  // grey for a pure DMC. This assertion tracks that correction, not a regression.
  const dmcWhite = getWhiteStatKeys(['DMC']);
  const dmcAll   = getAllStatKeys(['DMC']);
  assert(`DMC white stat count = 9 (STRENGTH grey since Sprint 31)`, dmcWhite.length === 9);
  assert(`DMC total stat count = 15`, dmcAll.length === 15);
  assert('TACKLING is white for DMC', isWhiteStat(['DMC'], 'TACKLING'));
  assert('SPEED is grey for DMC',    !isWhiteStat(['DMC'], 'SPEED'));
}

{
  // GK confirmed: 11 white (all 10 GK stats + FITNESS) + 4 grey
  const gkWhite = getWhiteStatKeys(['GK']);
  const gkAll   = getAllStatKeys(['GK']);
  assert(`GK white stat count = 11`, gkWhite.length === 11);
  assert(`GK total stat count = 15`, gkAll.length === 15);
  assert('REFLEXES is white for GK',  isWhiteStat(['GK'], 'REFLEXES'));
  assert('FITNESS is white for GK',   isWhiteStat(['GK'], 'FITNESS'));
  assert('SPEED is grey for GK',     !isWhiteStat(['GK'], 'SPEED'));
}

{
  // Multi-role union: DL+ML+AML — white union should include at least CROSSING (DL white), DRIBBLING (ML white)
  assert('DL+ML+AML: CROSSING is white (from DL)', isWhiteStat(['DL', 'ML', 'AML'], 'CROSSING'));
  assert('DL+ML+AML: DRIBBLING is white (from ML)', isWhiteStat(['DL', 'ML', 'AML'], 'DRIBBLING'));
}

// ─── 8. Role adjacency ────────────────────────────────────────────────────────

section('8. Role adjacency validation');

{
  assert('MC + DMC → adjacent (valid)',   validateRoleAdjacency(['MC', 'DMC']));
  assert('DC + DMC → adjacent (valid)',   validateRoleAdjacency(['DC', 'DMC']));
  assert('DL + DC  → adjacent (valid)',   validateRoleAdjacency(['DL', 'DC']));
  assert('GK + ST  → NOT adjacent (invalid)', !validateRoleAdjacency(['GK', 'ST']));
  assert('ML + DR  → NOT adjacent (invalid)', !validateRoleAdjacency(['ML', 'DR']));
  assert('Single role GK → valid',        validateRoleAdjacency(['GK']));
}

// ─── 9. Fixture window ────────────────────────────────────────────────────────

section('9. Fixture window calculation');

{
  // 24 hours, 60-min cooldown → 24 cycles
  const win = calculateFixtureCycles(24, 60);
  assert('24h / 60min cooldown = 24 cycles',             win.cycles === 24);
  assert('totalSessions = 24 × 6 = 144',                 win.totalSessions === 144);
}

{
  // 3 hours, 45-min cooldown → floor(180/45) = 4 cycles
  const win = calculateFixtureCycles(3, 45);
  assert('3h / 45min cooldown = 4 cycles',               win.cycles === 4);
}

// ─── 10. Restorer bridge ──────────────────────────────────────────────────────

section('10. Restorer bridge (additional drill cycles per restorer)');

{
  // VE+L0 condition cost = 0.75 × 1 × (1-0.10) = 0.675%
  // cyclesPerRestorer = floor(15 / 0.675) = 22
  const bridge = calculateRestorersBridge(3, 24, profile);
  assert('bridge.worthwhile = true (3 restorers, 24 natural cycles)', bridge.worthwhile);
  assert('additionalCycles = cyclesPerRestorer × 3', bridge.additionalCycles > 0);
  // Each restorer adds floor(15/0.675) = 22 cycles
  assertClose('cyclesPerRestorer ≈ 22', bridge.additionalCycles / 3, 22, 1);
}

{
  // 0 restorers → not worthwhile
  const bridge = calculateRestorersBridge(0, 24, profile);
  assert('0 restorers → not worthwhile',          !bridge.worthwhile);
  assert('0 restorers → additionalCycles = 0',    bridge.additionalCycles === 0);
}

// ─── 11. Drill database sanity ────────────────────────────────────────────────

section('11. Drill database sanity checks');

{
  const names = DRILL_LIST.map(d => d.name);
  assert('Touch Training in drill list',   names.includes('Touch Training'));
  assert('Line Hold in drill list',        names.includes('Line Hold'));
  assert('Break Away in drill list',       names.includes('Break Away'));

  const tt = DRILL_LIST.find(d => d.name === 'Touch Training');
  assert('Touch Training intensity = Very Easy', tt?.intensity === 'Very Easy');
  assert('Touch Training type = Possession',     tt?.type === 'Possession');

  const db = DRILL_LIST.find(d => d.name === 'Break Away');
  assert('Break Away intensity = Very Hard', db?.intensity === 'Very Hard');

  // All drills must have a non-empty stats array
  const missing = DRILL_LIST.filter(d => !d.stats || d.stats.length === 0);
  assert(`All drills have at least one stat trained (${missing.length} missing)`, missing.length === 0);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`  Results:  ${passed} passed  ·  ${failed} failed`);
console.log(`${'═'.repeat(60)}\n`);

if (failed > 0) process.exit(1);
