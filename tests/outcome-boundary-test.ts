/**
 * outcome-boundary-test — the outcome may test the model; it may not make it.
 *
 * The boundary this file defends:
 *
 *   PRE-OUTCOME STATE  →  prediction        (calibrated mathematics only)
 *   OBSERVED OUTCOME   →  calibration / falsification of that prediction
 *
 * and never the reverse arrow. An observed `+lo–hi` exists to constrain or
 * refute the transfer model. A quantity used to produce a prediction cannot also
 * test it: agreement obtained that way is guaranteed rather than earned, which
 * is Prop. XXV's fault with the two artefacts collapsed into one.
 *
 * The central test is `putting the correct answer into the outcome cannot change
 * the prediction`. It hands the predictor the same pre-outcome state twice while
 * varying the captured outcome over the true answer, a wildly wrong answer and
 * nothing at all, and requires the prediction to be identical each time. Wire an
 * observation into the prediction path and it fails immediately.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { projectCoachAction } from '../src/logic/recommendation';
import type { CoachPreviewInterval } from '../src/logic/recommendation';
import {
  buildOutcomeEvidence, compareObservedAgainstPrediction, type PredictedDelta,
} from '../src/logic/outcomeEvidence';
import {
  calibrationEligible, calibrationEvidence, type StatGain,
} from '../src/logic/runEvidence';
import type { Player } from '../src/database/playerSchema';
import type { GameProfile } from '../src/types/resources';
import profileJson from '../profiles/game_2025.json';

const profile = profileJson as unknown as GameProfile;
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const readCode = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const OUTFIELD: Record<string, number> = {
  TACKLING: 120, MARKING: 120, POSITIONING: 120, HEADING: 120, BRAVERY: 120,
  PASSING: 120, DRIBBLING: 120, CROSSING: 120, SHOOTING: 120, FINISHING: 120,
  FITNESS: 120, STRENGTH: 120, AGGRESSION: 120, SPEED: 120, CREATIVITY: 120,
};
const subject = (): Player => ({
  id: 'p1', name: 'Subject', role: ['DC', 'DMC'], age: 20, overall: 120,
  tier: 'T0', talent: 'Normal', stats: { ...OUTFIELD }, isMutantCandidate: false,
});
const STATS = ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'];

// ---------------------------------------------------------------------------
// 1. the outcome cannot reach the prediction
// ---------------------------------------------------------------------------

/**
 * The outcomes a run might later be observed to have. Each set is handed to the
 * production path; none of them may move it.
 */
function outcomeSets(stats: string[], truth?: PredictedDelta[]): Array<[string, CoachPreviewInterval[]]> {
  return [
    ['no outcome', []],
    ['undefined', undefined as unknown as CoachPreviewInterval[]],
    ['a wildly wrong answer', stats.map(stat => ({ stat, statBefore: 1, gainLo: 900, gainHi: 999 }))],
    ['a zero outcome', stats.map(stat => ({ stat, gainLo: 0, gainHi: 0 }))],
    ...(truth ? [['the correct answer', truth.map(d => ({
      stat: d.stat, gainLo: Math.floor(d.delta), gainHi: Math.ceil(d.delta) + 1,
    }))] as [string, CoachPreviewInterval[]]] : []),
  ];
}

/**
 * Calls production the only way it can now be called — with pre-outcome state
 * only — while an observed outcome exists alongside. If the boundary holds, the
 * outcome argument is unreachable from here, which is the point: the call site
 * has no channel through which to leak it.
 */
function produce(pre: {
  player: Player; stats: string[]; sessions: number; profile: GameProfile;
  transferClass: 'ordinary' | 'reward' | 'unknown';
}, observed: CoachPreviewInterval[]) {
  const projection = projectCoachAction({
    player: pre.player, stats: pre.stats, sessions: pre.sessions,
    profile: pre.profile, transferClass: pre.transferClass,
  });
  // The evidence is carried in parallel and joined afterwards, never merged in.
  return { projection, evidence: buildOutcomeEvidence(observed) };
}

test('same pre-outcome state + different observed outcomes => identical production result (ordinary)', () => {
  const pre = { player: subject(), stats: STATS, sessions: 40, profile, transferClass: 'ordinary' } as const;
  const baseline = projectCoachAction({ ...pre });
  assert.equal(baseline.projectionStatus, 'projected');

  for (const [label, observed] of outcomeSets(STATS, baseline.statDeltas)) {
    const { projection } = produce(pre, observed);
    assert.deepEqual(projection, baseline,
      `the ordinary projection changed when ${label} was the eventual outcome`);
  }
});

test('same pre-outcome state + different observed outcomes => identical production result (reward)', () => {
  const pre = { player: subject(), stats: STATS, sessions: 40, profile, transferClass: 'reward' } as const;
  const baseline = projectCoachAction({ ...pre });
  assert.equal(baseline.projectionStatus, 'unavailable');

  for (const [label, observed] of outcomeSets(STATS)) {
    const { projection } = produce(pre, observed);
    assert.deepEqual(projection, baseline,
      `the Reward abstention changed when ${label} was the eventual outcome`);
  }
});

test('same pre-outcome state + different observed outcomes => identical production result (unknown)', () => {
  const pre = { player: subject(), stats: STATS, sessions: 40, profile, transferClass: 'unknown' } as const;
  const baseline = projectCoachAction({ ...pre });
  assert.equal(baseline.projectionStatus, 'unavailable');

  for (const [label, observed] of outcomeSets(STATS)) {
    const { projection } = produce(pre, observed);
    assert.deepEqual(projection, baseline,
      `the unknown abstention changed when ${label} was the eventual outcome`);
  }
});

test('only the separate evidence/comparison result may change', () => {
  // The other half of the invariance: the outcome must still MATTER somewhere,
  // or the boundary would be satisfied by simply discarding evidence.
  const pre = { player: subject(), stats: STATS, sessions: 40, profile, transferClass: 'ordinary' } as const;
  const baseline = projectCoachAction({ ...pre });
  assert.equal(baseline.projectionStatus, 'projected');
  const deltas = baseline.statDeltas.map(d => ({ stat: d.stat, delta: d.delta }));

  const agreeing = deltas.map(d => ({ stat: d.stat, gainLo: d.delta - 1, gainHi: d.delta + 1 }));
  const refuting = deltas.map(d => ({ stat: d.stat, gainLo: d.delta + 50, gainHi: d.delta + 60 }));

  const ok = compareObservedAgainstPrediction(deltas, agreeing, 'ordinary');
  const bad = compareObservedAgainstPrediction(deltas, refuting, 'ordinary');
  assert.equal(ok.contradicted, false);
  assert.equal(bad.contradicted, true, 'an outcome outside the prediction must falsify it');
  assert.notDeepEqual(ok, bad, 'the comparison is where the outcome is allowed to matter');

  // An abstaining class predicted nothing, so nothing passed a test.
  const none = compareObservedAgainstPrediction(null, agreeing, 'reward');
  assert.ok(none.verdicts.every(v => v.verdict === 'untestable'));
  assert.equal(none.contradicted, false);
});

test('the comparison forms no midpoint of an observed interval', () => {
  const r = compareObservedAgainstPrediction(
    [{ stat: 'FINISHING', delta: 8 }],
    [{ stat: 'FINISHING', gainLo: 5, gainHi: 11 }], 'ordinary');
  const numbers: number[] = [];
  JSON.stringify(r, (_k, v) => { if (typeof v === 'number') numbers.push(v); return v; });
  assert.ok(numbers.includes(5) && numbers.includes(11), 'both bounds must survive');
  assert.equal(numbers.includes(11 - 5), false, 'the width is not a measurement');
  const src = readCode('src/logic/outcomeEvidence.ts');
  assert.equal(/gainLo\s*\+\s*.*gainHi|\(\s*lo\s*\+\s*hi\s*\)/.test(src), false,
    'the comparison must never combine two bounds');
});

test('the sweep holds across ages, session counts and stat sets', () => {
  for (const age of [18, 20, 23, 27]) {
    for (const sessions of [4, 40, 114]) {
      for (const stats of [STATS, ['TACKLING'], ['HEADING', 'STRENGTH']]) {
        const pre = { player: { ...subject(), age }, stats, sessions, profile,
                      transferClass: 'ordinary' } as const;
        const clean = projectCoachAction({ ...pre });
        const { projection } = produce(pre,
          stats.map(stat => ({ stat, gainLo: 777, gainHi: 888 })));
        assert.deepEqual(projection, clean,
          `age ${age}, x${sessions}, ${stats.length} stats: outcome leaked into prediction`);
      }
    }
  }
});

test('an observed outcome cannot be handed to production at all — a compile error', () => {
  // The boundary is now stronger than when this probe was written: the observed
  // field is gone from CoachActionInput too, typed `never` on both the routing
  // input and the predictor input. So the probe no longer asks whether one type
  // is assignable to the other — it asks whether an actual observed interval can
  // be passed to EITHER. Delete either `never` and this compiles and fails.
  const dir = mkdtempSync(join(tmpdir(), 'boundary-'));
  const probe = join(dir, 'probe.ts');
  const rec = join(__dirname, '..', 'src', 'logic', 'recommendation');
  writeFileSync(probe, `
import type { CoachActionInput, PreOutcomeCoachInput, CoachPreviewInterval } from ${JSON.stringify(rec)};
const observed: CoachPreviewInterval[] = [{ stat: 'FINISHING', gainLo: 5, gainHi: 7 }];
export const intoRouting: CoachActionInput = {
  player: null as never, stats: [], sessions: 1, profile: null as never,
  observedGainIntervals: observed,
};
export const intoPredictor: PreOutcomeCoachInput = {
  player: null as never, stats: [], sessions: 1, profile: null as never,
  observedGainIntervals: observed,
};
`);
  let output = '';
  try {
    execFileSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck',
      '--resolveJsonModule', '--target', 'es2020', '--moduleResolution', 'node', probe],
      { cwd: join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e: unknown) {
    output = String((e as { stdout?: string }).stdout ?? '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // tsc names the offending TYPE rather than the property, so the assertion
  // counts the rejections rather than grepping for a field name: one for the
  // routing input, one for the predictor input. Remove either `never` and the
  // corresponding line disappears and this fails.
  const rejections = output.split('\n')
    .filter(l => l.includes('probe.ts') && /is not assignable to type 'undefined'/.test(l));
  assert.equal(rejections.length, 2,
    `both the routing input and the predictor input must reject an observed interval; got:\n${output}`);
  assert.ok(rejections.every(l => /CoachPreviewInterval\[\]/.test(l)),
    'the rejected thing must be the observed interval itself');
});

test('the ordinary prediction body never mentions an observed quantity', () => {
  const src = readCode('src/logic/recommendation.ts');
  const start = src.indexOf('function predictOrdinaryCoachAction');
  assert.ok(start > 0, 'the prediction must live in its own function');
  const body = src.slice(start);
  for (const forbidden of [/observedGainIntervals/, /gainLo/, /gainHi/, /ovrAfterLo/, /ovrAfterHi/]) {
    assert.equal(forbidden.test(body), false,
      `the prediction reads an observed quantity (${forbidden})`);
  }
});

// ---------------------------------------------------------------------------
// 1b. the write contract: provenance is declared, not inferred
// ---------------------------------------------------------------------------

/**
 * Compiles a snippet against the real source tree and returns tsc's output.
 *
 * A contract of the form "this state is not representable" cannot be checked at
 * runtime — the whole point is that no value of that shape exists to test. The
 * only honest check is that the compiler rejects it, so these probes assert on
 * a FAILED compile and would fail if the code started compiling.
 */
function compileProbe(body: (svc: string, ev: string) => string): string {
  const dir = mkdtempSync(join(tmpdir(), 'writecontract-'));
  const probe = join(dir, 'probe.ts');
  const svc = JSON.stringify(join(__dirname, '..', 'src', 'services', 'squadPlanService'));
  const ev = JSON.stringify(join(__dirname, '..', 'src', 'logic', 'runEvidence'));
  writeFileSync(probe, body(svc, ev));
  try {
    execFileSync('npx', ['tsc', '--noEmit', '--strict', '--skipLibCheck',
      '--resolveJsonModule', '--target', 'es2020', '--moduleResolution', 'node',
      '--jsx', 'react-jsx', probe],
      { cwd: join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return '';
  } catch (e: unknown) {
    return String((e as { stdout?: string }).stdout ?? '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const probeErrors = (out: string) => out.split('\n').filter(l => l.includes('probe.ts'));

const COMMON = `sessions: 4, selectedStats: ['MARKING'], ovrBefore: 185,`;
const OBSERVED_GAIN = `{ kind: 'observed-interval' as const, stat: 'MARKING', from: 139, gainLo: 11, gainHi: 16, isWhite: true }`;
const PROJECTED_GAIN = `{ kind: 'projected' as const, stat: 'MARKING', from: 139, gain: 13.2, isWhite: true }`;

test('observed gains + ovrAfter cannot compile', () => {
  const out = compileProbe(svc => `
import type { SaveRunInput } from ${svc};
export const bad: SaveRunInput = {
  kind: 'observed-interval', ${COMMON}
  gains: [${OBSERVED_GAIN}],
  ovrAfter: 187,
};
`);
  assert.ok(probeErrors(out).length > 0,
    'an observed run must have no API by which to supply a post-action OVR');
});

test('projected gains + observed boost bounds cannot compile', () => {
  const out = compileProbe(svc => `
import type { SaveRunInput } from ${svc};
export const bad: SaveRunInput = {
  kind: 'projected', ${COMMON}
  gains: [${PROJECTED_GAIN}],
  ovrAfter: 187,
  ovrBoostLo: 2, ovrBoostHi: 6,
};
`);
  assert.ok(probeErrors(out).length > 0,
    'a projection observed nothing and must not be able to claim a boost');
});

test('projected and observed gains cannot be mixed in one newly-written run', () => {
  const out = compileProbe(svc => `
import type { SaveRunInput } from ${svc};
export const mixedAsObserved: SaveRunInput = {
  kind: 'observed-interval', ${COMMON}
  gains: [${OBSERVED_GAIN}, ${PROJECTED_GAIN}],
};
export const mixedAsProjected: SaveRunInput = {
  kind: 'projected', ${COMMON}
  gains: [${PROJECTED_GAIN}, ${OBSERVED_GAIN}],
  ovrAfter: 187,
};
`);
  // One rejection per declaration: a run has ONE provenance, so an array of two
  // kinds cannot satisfy either branch.
  assert.equal(probeErrors(out).length >= 2, true,
    `both mixed-kind runs must be rejected; got:\n${out}`);
});

test('legacy-unknown cannot be newly written', () => {
  const out = compileProbe((svc, ev) => `
import type { SaveRunInput } from ${svc};
import type { LegacyStatGain } from ${ev};
const legacy: LegacyStatGain = { kind: 'legacy-unknown', stat: 'MARKING', from: 139, unattributableGain: 13.5, isWhite: true };
export const asKind: SaveRunInput = {
  kind: 'legacy-unknown', ${COMMON} gains: [legacy], ovrAfter: 187,
} as SaveRunInput;
export const asGains: SaveRunInput = {
  kind: 'observed-interval', ${COMMON} gains: [legacy],
};
`);
  // legacy-unknown is a READ state, and BOTH routes to writing one must be
  // closed: the discriminant and the gain type. Asserting merely "some error"
  // would pass while one route reopened — widening `gains` to StatGain[] leaves
  // the discriminant rejection in place and would have slipped through.
  assert.equal(probeErrors(out).length, 2,
    `both the legacy discriminant and legacy gains must be rejected; got:\n${out}`);
});

test('a half-supplied observed boost cannot compile', () => {
  // Half an interval is not an interval. The pairing is in the type, not left
  // to a runtime check the next caller might forget.
  const out = compileProbe(svc => `
import type { SaveRunInput } from ${svc};
export const bad: SaveRunInput = {
  kind: 'observed-interval', ${COMMON}
  gains: [${OBSERVED_GAIN}],
  ovrBoostLo: 2,
};
`);
  assert.ok(probeErrors(out).length > 0,
    'an observed boost must be supplied as both bounds or neither');
});

test('the two legitimate write shapes DO compile', () => {
  // The converse. Without this the contracts above could be satisfied by a type
  // that rejects everything, which would be useless rather than strict.
  const out = compileProbe(svc => `
import type { SaveRunInput } from ${svc};
export const projected: SaveRunInput = {
  kind: 'projected', ${COMMON} gains: [${PROJECTED_GAIN}], ovrAfter: 187,
};
export const observedWithBoost: SaveRunInput = {
  kind: 'observed-interval', ${COMMON} gains: [${OBSERVED_GAIN}], ovrBoostLo: 2, ovrBoostHi: 6,
};
export const observedWithout: SaveRunInput = {
  kind: 'observed-interval', ${COMMON} gains: [${OBSERVED_GAIN}],
};
`);
  assert.deepEqual(probeErrors(out), [],
    `the legitimate shapes must compile; got:\n${out}`);
});

// ---------------------------------------------------------------------------
// 2. only observed evidence may calibrate
// ---------------------------------------------------------------------------

const observed: StatGain = {
  kind: 'observed-interval', stat: 'MARKING', from: 139,
  gainLo: 11, gainHi: 16, isWhite: true,
};
const projected: StatGain = {
  kind: 'projected', stat: 'MARKING', from: 139, gain: 13.2, isWhite: true,
};
const legacy: StatGain = {
  kind: 'legacy-unknown', stat: 'MARKING', from: 139, unattributableGain: 13.5, isWhite: true,
};

test('a projected record is not calibration evidence', () => {
  // Calibrating the model against its own output guarantees the agreement.
  assert.equal(calibrationEligible(projected), false);
  assert.deepEqual(calibrationEvidence([projected]), []);
});

test('a legacy-unknown record is not calibration evidence', () => {
  assert.equal(calibrationEligible(legacy), false);
  assert.deepEqual(calibrationEvidence([legacy]), []);
});

test('only the observed intervals survive the gate', () => {
  assert.equal(calibrationEligible(observed), true);
  assert.deepEqual(calibrationEvidence([projected, observed, legacy]), [observed]);
});

test('the gate is what grants access to the bounds', () => {
  // Not a style preference: calibrationEligible is a type guard, so a caller
  // cannot read gainLo/gainHi without first proving the row is entitled to be
  // in a calibration at all. The compiler carries the eligibility check.
  const src = readCode('src/logic/runEvidence.ts');
  assert.match(src, /export function calibrationEligible\(g: StatGain\): g is ObservedStatGain/,
    'calibrationEligible must be a type guard, not a boolean helper');
  // And the two ungraded kinds must not expose an identically-named scalar,
  // or `kind !== 'observed-interval' ? g.gain : …` silently admits legacy rows.
  const legacyBlock = src.slice(src.indexOf('export interface LegacyStatGain'),
                                src.indexOf('export type StatGain'));
  assert.equal(/^\s*gain:/m.test(legacyBlock), false,
    'a legacy row must not carry a field named `gain`');
  assert.match(legacyBlock, /unattributableGain: number;/);
});

// ---------------------------------------------------------------------------
// 3. the capture screen records, and does not reconstruct
// ---------------------------------------------------------------------------

test('capture.tsx manufactures no OVR quantity', () => {
  const src = readCode('app/coach/capture.tsx');
  assert.equal(/computeOvrWithPadding/.test(src), false,
    'padding substitutes stand-ins for unread attributes; it has no role in an evidence path');
  assert.equal(/ovrProjector/.test(src), false,
    'the evidence path must not import the projector at all');
  for (const reconstruction of [
    /\/\s*15\b/, /totalAttributeCount/, /qualityPctToOvr/,
    /gainLo\s*\+\s*.*gainHi/, /\(\s*lo\s*\+\s*hi\s*\)/,
  ]) {
    assert.equal(reconstruction.test(src), false,
      `an OVR outcome must not be reconstructed from stat gains (${reconstruction})`);
  }
});

test('capture.tsx records the observed BOOST, not a post-OVR derived from it', () => {
  // This assertion previously required `ovrAfterLo: ovrBefore + observedOvrBoostLo`
  // while its own message claimed the stored value was the observed boost. The
  // test encoded the laundering it was written to forbid: the game displays a
  // boost range and never a post-action OVR, so ovrBefore + boost is a third
  // quantity nobody observed, wearing an observed grade.
  const src = read('app/coach/capture.tsx');
  assert.match(src, /setObservedOvrBoostLo\(scan\.ovrBoostLo\)/,
    'the recorded boost must come from the scanned preview');
  assert.match(src, /const bothOvrBounds = observedOvrBoostLo !== null && observedOvrBoostHi !== null;/,
    'both ends must be observed before an outcome is recorded');
  assert.match(src, /ovrBoostLo: observedOvrBoostLo!, ovrBoostHi: observedOvrBoostHi!/,
    'the observed boost must be stored as itself');
  assert.equal(/ovrBefore \+ observedOvrBoost/.test(src), false,
    'a post-action OVR must not be synthesised by addition');
  assert.equal(/ovrAfterLo|ovrAfterHi/.test(src), false,
    'there is no observed post-action OVR to store');
});

test('one completeness rule, not two', () => {
  // The set mismatch this replaces: saveToLog required both bounds while the
  // OVR memo guarded each bound independently, so a saved ovrAfterHi could
  // include a stat absent from the saved gains. With the memo gone there is one
  // rule; this fails if a second independent bound guard reappears.
  const src = readCode('app/coach/capture.tsx');
  // The unrelated guard at the stat-value parse stays; what must not exist is a
  // second rule deciding whether a GAIN BOUND counts.
  for (const secondRule of [/isNaN\(lo\)/, /isNaN\(hi\)/, /isNaN\(parseFloat\(g\.(lo|hi)\)/]) {
    assert.equal(secondRule.test(src), false,
      `a second bound-completeness rule reappeared (${secondRule})`);
  }
  assert.equal((src.match(/observedStatGain\(/g) ?? []).length, 1,
    'observedStatGain is the single place completeness is decided');
});
