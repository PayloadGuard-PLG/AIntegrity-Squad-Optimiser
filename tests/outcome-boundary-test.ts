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

test('putting the correct answer into the outcome cannot change the prediction', () => {
  const preOutcome = { player: subject(), stats: STATS, sessions: 40, profile } as const;

  // Run the predictor once with no outcome at all, to learn what it says.
  const baseline = projectCoachAction({ ...preOutcome, transferClass: 'ordinary' });
  assert.equal(baseline.projectionStatus, 'projected');

  // THE CORRECT ANSWER, handed over as captured outcome. If any part of the
  // prediction path reads it, the projection moves toward it and this fails.
  const truth: CoachPreviewInterval[] = baseline.statDeltas.map(d => ({
    stat: d.stat, statBefore: d.from,
    gainLo: Math.floor(d.delta), gainHi: Math.ceil(d.delta) + 1,
  }));
  // A wildly wrong answer, to catch a path that reads the outcome but happens
  // to agree with the truth by construction.
  const nonsense: CoachPreviewInterval[] = STATS.map(stat => ({
    stat, statBefore: 1, gainLo: 900, gainHi: 999,
  }));
  const empty: CoachPreviewInterval[] = [];

  for (const [label, observed] of [
    ['the correct answer', truth],
    ['a wildly wrong answer', nonsense],
    ['no outcome', empty],
  ] as const) {
    const withOutcome = projectCoachAction({
      ...preOutcome, transferClass: 'ordinary', observedGainIntervals: observed,
    });
    assert.deepEqual(withOutcome, baseline,
      `the prediction changed when handed ${label} as captured outcome`);
  }
});

test('the same holds across ages, session counts and whiteness', () => {
  // One shape can pass by luck. Sweep the model variables that legitimately
  // drive a prediction and require outcome-independence at every point.
  for (const age of [18, 20, 23, 27]) {
    for (const sessions of [4, 40, 114]) {
      for (const stats of [STATS, ['TACKLING'], ['HEADING', 'STRENGTH']]) {
        const pre = { player: { ...subject(), age }, stats, sessions, profile } as const;
        const clean = projectCoachAction({ ...pre, transferClass: 'ordinary' });
        const poisoned = projectCoachAction({
          ...pre, transferClass: 'ordinary',
          observedGainIntervals: stats.map(stat => ({ stat, gainLo: 777, gainHi: 888 })),
        });
        assert.deepEqual(poisoned, clean,
          `age ${age}, ×${sessions}, ${stats.length} stats: outcome leaked into prediction`);
      }
    }
  }
});

test('the prediction function cannot be handed an observed outcome — a compile error, not a convention', () => {
  // TypeScript accepts a wider object where a narrower one is expected, so
  // omitting the observed fields from PreOutcomeCoachInput would NOT stop a
  // caller passing the whole CoachActionInput. The `never` typing is what does.
  // This test compiles a probe and requires it to FAIL. Delete those fields and
  // the probe compiles clean and this test fails.
  const dir = mkdtempSync(join(tmpdir(), 'boundary-'));
  const probe = join(dir, 'probe.ts');
  const rec = join(__dirname, '..', 'src', 'logic', 'recommendation');
  writeFileSync(probe, `
import type { CoachActionInput, PreOutcomeCoachInput } from ${JSON.stringify(rec)};
export function leak(i: CoachActionInput): PreOutcomeCoachInput { return i; }
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
  assert.match(output, /not assignable to type 'PreOutcomeCoachInput'/,
    'CoachActionInput must not be assignable to the predictor input');
  assert.match(output, /observedGainIntervals/,
    'the observed evidence field must be what makes it inassignable');
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

test('capture.tsx records an OVR outcome only when one was observed', () => {
  const src = read('app/coach/capture.tsx');
  assert.match(src, /setObservedOvrBoostLo\(scan\.ovrBoostLo\)/,
    'the recorded boost must come from the scanned preview');
  assert.match(src, /const bothOvrBounds = observedOvrBoostLo !== null && observedOvrBoostHi !== null;/,
    'both ends must be observed before an outcome is recorded');
  assert.match(src, /ovrAfterLo: ovrBefore \+ observedOvrBoostLo!/,
    'the stored outcome must be the observed boost, not a derived one');
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
