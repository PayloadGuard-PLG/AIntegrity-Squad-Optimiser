/**
 * run-evidence-test — an interval is not its midpoint (Principia Prop. XXIV).
 *
 * The capture screen stored a coach preview's `+lo-hi` as `(lo + hi) / 2`, into
 * the very record the engine constants are back-calculated from. The game
 * states a range and has never stated where inside it the expectation sits, so
 * that midpoint was a precision the observation did not contain — and averaging
 * several of them compounds it, because it discards each observation's width.
 *
 * These tests pin four things:
 *
 *   1. an observed interval is recorded as two bounds and no arithmetic runs
 *      between them, structurally, not just by inspection of the happy path;
 *   2. a run that could not observe both bounds abstains rather than recording
 *      half an interval;
 *   3. a row written before the grades existed reads back as unattributable,
 *      never as an engine projection — its provenance was destroyed at write
 *      time and cannot be recovered by inference (Prop. XX scholium);
 *   4. no display path re-forms the midpoint after the record refused it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  observedStatGain, normaliseStatGain, normaliseRunOutcome,
  formatGain, formatOvrDelta, EVIDENCE_LABEL,
  type StatGain, type ObservedStatGain,
} from '../src/logic/runEvidence';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

/**
 * Source with comments removed. These files DESCRIBE the midpoint fault in
 * prose, so a scan for it has to look at the code and not at the explanation —
 * otherwise documenting the bug would register as committing it.
 */
const readCode = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// The Dallas pair from the Principia: the identical interval [4,6] at different
// attribute values, which is the proof these ranges are too coarse to carry the
// precision a midpoint implies. Their shared midpoint, 5, is the number that
// must never appear.
const DALLAS_A = observedStatGain('POSITIONING', 194, 4, 6, true)!;
const DALLAS_B = observedStatGain('AGGRESSION', 189, 4, 6, true)!;

// ---------------------------------------------------------------------------
// 1. both bounds are kept, and nothing between them is computed
// ---------------------------------------------------------------------------

test('an observed preview is recorded as two bounds', () => {
  assert.deepEqual(DALLAS_A, {
    kind: 'observed-interval', stat: 'POSITIONING', from: 194,
    gainLo: 4, gainHi: 6, isWhite: true,
  });
});

test('no midpoint appears anywhere in a serialised observed run', () => {
  // Structural, not a spot check: serialise the whole record and search it for
  // the midpoint and for the width. Any future field that quietly carries
  // either — a "gain", an "expected", a "mean" — fails here regardless of what
  // it is called.
  const gains: StatGain[] = [DALLAS_A, DALLAS_B,
    observedStatGain('MARKING', 139, 11, 16, true)!];
  const serialised = JSON.stringify({ gains });
  const values = JSON.parse(serialised).gains.flatMap(
    (g: Record<string, unknown>) => Object.values(g));

  for (const [lo, hi] of [[4, 6], [4, 6], [11, 16]] as const) {
    const mid = (lo + hi) / 2;
    assert.equal(values.includes(mid) && !values.includes(lo), false,
      `midpoint ${mid} of [${lo},${hi}] must not be stored`);
  }
  assert.equal(/"gain"\s*:/.test(serialised), false,
    'an observed gain must carry no scalar `gain` field to be mistaken for a measurement');
  assert.equal(serialised.includes('13.5'), false,
    'the midpoint of [11,16] must not appear in the record');
});

test('both bounds survive the shape the database stores and reads back', () => {
  const roundTripped = JSON.parse(JSON.stringify([DALLAS_A]))
    .map((g: Record<string, unknown>) => normaliseStatGain(g));
  assert.deepEqual(roundTripped, [DALLAS_A]);
  assert.equal(roundTripped[0].gainLo, 4);
  assert.equal(roundTripped[0].gainHi, 6);
});

test('two observations sharing an interval at different stat values stay distinct', () => {
  // The exact case the Principia cites. Under the midpoint rule both collapsed
  // to "+5" and their widths vanished, which is what made the calibration set
  // look better constrained than it was.
  assert.equal(DALLAS_A.gainLo, DALLAS_B.gainLo);
  assert.equal(DALLAS_A.gainHi, DALLAS_B.gainHi);
  assert.notEqual(DALLAS_A.from, DALLAS_B.from);
  assert.equal(formatGain(DALLAS_A).text, '+4–6');
  assert.equal(formatGain(DALLAS_B).text, '+4–6');
});

// ---------------------------------------------------------------------------
// 2. half an interval is not an interval
// ---------------------------------------------------------------------------

test('an interval with one end unread is not recorded', () => {
  assert.equal(observedStatGain('MARKING', 139, 11, undefined, true), undefined);
  assert.equal(observedStatGain('MARKING', 139, undefined, 16, true), undefined);
  assert.equal(observedStatGain('MARKING', 139, undefined, undefined, true), undefined);
  assert.equal(observedStatGain('MARKING', 139, NaN, 16, true), undefined);
  assert.equal(observedStatGain('MARKING', 139, 11, NaN, true), undefined);
});

test('an inverted interval is rejected rather than silently reordered', () => {
  // hi < lo means the read failed. Swapping them would fabricate an
  // observation out of a misread.
  assert.equal(observedStatGain('MARKING', 139, 16, 11, true), undefined);
});

test('a degenerate interval is a legitimate observation', () => {
  // Neri's age-32 stat-407 preview reads [0,0]. That is an observation of a
  // zero-width range, not a failure to read, and must be recorded.
  const zero = observedStatGain('SHOOTING', 407, 0, 0, true);
  assert.deepEqual(zero, {
    kind: 'observed-interval', stat: 'SHOOTING', from: 407,
    gainLo: 0, gainHi: 0, isWhite: true,
  });
  assert.equal(formatGain(zero!).text, '+0–0');
});

// ---------------------------------------------------------------------------
// 3. a legacy row is unattributable, not a projection
// ---------------------------------------------------------------------------

test('a row written before the grades existed reads as legacy-unknown', () => {
  const legacy = { stat: 'MARKING', from: 139, gain: 13.5, isWhite: true };
  const g = normaliseStatGain(legacy);
  assert.equal(g.kind, 'legacy-unknown',
    'promoting it to projected would assert its scalar came from the engine');
  assert.equal(normaliseRunOutcome({ ovrAfter: 187.5 }).kind, 'legacy-unknown');
});

test('a stored kind is not believed unless the row actually carries its fields', () => {
  // A row claiming to be an interval but holding only a scalar is not one.
  assert.equal(
    normaliseStatGain({ kind: 'observed-interval', stat: 'X', from: 1, gain: 5 }).kind,
    'legacy-unknown');
  // An observed row carrying no boost columns reports that none was observed —
  // it must not fall through to ovr_after, which on such a row is a NOT NULL
  // storage filler and not a reading.
  assert.equal(
    normaliseRunOutcome({ gainEvidence: 'observed-interval', ovrAfter: 187.5 }).kind,
    'none-observed');
});

test('a genuinely projected row keeps its grade', () => {
  const g = normaliseStatGain({ kind: 'projected', stat: 'TACKLING', from: 120, gain: 59.2, isWhite: true });
  assert.equal(g.kind, 'projected');
  assert.equal(normaliseRunOutcome({ gainEvidence: 'projected', ovrAfter: 173.4 }).kind, 'projected');
});

test('no helper derives a run grade from its gains', () => {
  // This replaces 'a run is graded by its weakest part', which tested
  // runEvidenceKind. That function's only production caller inferred the WRITE
  // grade from the gain array, which the discriminated SaveRunInput now
  // forbids — the caller declares provenance and that declaration constrains
  // the gain type simultaneously. The function is gone; this fails if it or an
  // equivalent returns.
  const src = readCode('src/logic/runEvidence.ts');
  assert.equal(/export function runEvidenceKind/.test(src), false,
    'runEvidenceKind must not return');
  const service = readCode('src/services/squadPlanService.ts');
  assert.equal(/runEvidenceKind/.test(service), false,
    'the service must not infer a write grade from the gains');
  assert.match(service, /const gainEvidence: EvidenceKind = data\.kind;/,
    'the grade must come from the declared kind');
});

// ---------------------------------------------------------------------------
// 4. the display does not re-form what the record refused
// ---------------------------------------------------------------------------

test('an interval renders as an interval, carrying its grade', () => {
  assert.deepEqual(formatGain(DALLAS_A), { text: '+4–6', grade: 'observed-interval' });
  // The observed case needs no subtraction: the boost interval IS the change.
  assert.deepEqual(
    formatOvrDelta({ kind: 'observed-boost-interval', ovrBoostLo: 2, ovrBoostHi: 6 }, 183),
    { text: '+2–6', grade: 'observed-interval' });
  assert.deepEqual(formatOvrDelta({ kind: 'none-observed' }, 183),
    { text: 'NOT OBSERVED', grade: 'observed-interval' });
});

test('every grade has a label, so no figure is shown without one', () => {
  for (const kind of ['projected', 'observed-interval', 'legacy-unknown'] as const) {
    assert.ok(EVIDENCE_LABEL[kind], `no label for ${kind}`);
  }
});

test('the formatter contains no averaging branch', () => {
  const src = readCode('src/logic/runEvidence.ts');
  for (const pattern of [
    /gainLo\s*\+\s*.*gainHi/, /gainHi\s*\+\s*.*gainLo/,
    /ovrAfterLo\s*\+\s*.*ovrAfterHi/, /\(\s*lo\s*\+\s*hi\s*\)/,
  ]) {
    assert.equal(pattern.test(src), false,
      `runEvidence must never combine two bounds (${pattern})`);
  }
});

// ---------------------------------------------------------------------------
// 5. the writers
// ---------------------------------------------------------------------------

test('the capture screen no longer averages a preview interval', () => {
  const src = readCode('app/coach/capture.tsx');
  // The exact expressions removed, and the general shape.
  assert.equal(/parseFloat\(g\.hi\)[^\n]*\+[^\n]*parseFloat\(g\.lo\)[^\n]*\/\s*2/.test(src), false,
    'the stat-gain midpoint must not return');
  assert.equal(/ovrBoostLo[^\n]*\+[^\n]*ovrBoostHi[^\n]*\)\s*\/\s*2/.test(src), false,
    'the OVR midpoint must not return');
  assert.match(src, /observedStatGain\(/,
    'observed previews must be recorded through the interval constructor');
  assert.match(src, /ovrBoostLo: observedOvrBoostLo!, ovrBoostHi: observedOvrBoostHi!/,
    'the observed OVR boost must be written as its own two bounds');
});

test('the coaches screen records engine output as projected, not as an interval', () => {
  const src = readCode('app/(tabs)/coaches.tsx');
  assert.match(src, /kind: 'projected', stat: d\.stat/,
    'engine gains carry one number and must be graded projected');
  // bd5bc96's rule, re-pinned: the screen's observed intervals stay intervals.
  assert.equal(/gainLo \+ .*gainHi\) *\/ *2|\(lo \+ hi\) *\/ *2/.test(src), false,
    'no midpoint may be formed on the coaches screen');
});

test('stored runs default to unattributable, and the guard that does it exists', () => {
  const schema = read('src/db/schema.ts');
  const dbIndex = read('src/db/index.ts');
  const layout = read('app/_layout.tsx');

  assert.match(schema, /gainEvidence: text\('gain_evidence'\)[\s\S]{0,60}default\('legacy-unknown'\)/,
    'the provenance column must default to legacy-unknown, not to a real grade');
  assert.match(schema, /ovrBoostLo: real\('ovr_boost_lo'\)/);
  assert.match(schema, /ovrBoostHi: real\('ovr_boost_hi'\)/);
  assert.match(dbIndex, /ADD COLUMN gain_evidence TEXT NOT NULL DEFAULT 'legacy-unknown'/,
    'devices that already have the table need the column back-filled as unattributable');
  assert.match(layout, /ensureRunEvidenceColumns\(\)/,
    'the guard must actually run at startup');
});

test('the ovr_after filler is generated only inside the persistence layer', () => {
  // The filler exists because ovr_after is NOT NULL on the original table. It
  // must be MANUFACTURED in saveRun, not accepted from a caller, and it must
  // never be a sum — writing `ovrBefore + boost` there would recreate the
  // laundered post-OVR one layer below the grade, where the graded readers
  // cannot see it but raw SQL would.
  const src = readCode('src/services/squadPlanService.ts');
  const saveRun = src.slice(src.indexOf('saveRun(playerId'), src.indexOf('getRunsForPlayer'));

  assert.match(saveRun, /const ovrAfter = data\.kind === 'projected' \? data\.ovrAfter : data\.ovrBefore;/,
    'the filler must be derived from the declared kind inside saveRun');
  const derivation = saveRun.split('\n').find(l => l.includes('const ovrAfter ='))!;
  assert.equal(/\+/.test(derivation), false, 'the filler must not be a sum');
  assert.equal(/ovrBoost/.test(derivation), false,
    'the filler must not be derived from the observed boost');

  // And the observed variant of the write type must offer no ovrAfter at all,
  // so there is no API through which a caller could supply one. The compile-fail
  // probe in tests/outcome-boundary-test.ts proves the compiler enforces it.
  assert.match(src, /kind: 'observed-interval';[\s\S]{0,600}ovrAfter\?: never;/,
    'an observed caller must have no ovrAfter field');
});

test('the service grades every row it writes and reads', () => {
  const src = read('src/services/squadPlanService.ts');
  assert.match(src, /gainEvidence,/, 'saveRun must record the grade');
  assert.match(src, /normaliseStatGain/, 'every stored gain must be read through the normaliser');
  assert.match(src, /normaliseRunOutcome/, 'the outcome must be read through the normaliser');
  // The real guarantee is the exported shape: SquadPlanRun carries `outcome`
  // and no bare `ovrAfter`, so a consumer cannot read a quality figure without
  // first meeting its grade. tsc enforces it — squad-plan.tsx failed to compile
  // against the old field until it was rewritten to read the outcome.
  // Bounded by the next declaration. SaveRunInput became a `type` when the
  // write contract was discriminated, so an `export interface SaveRunInput`
  // anchor silently returns -1 and slices to end-of-file.
  const start = src.indexOf('export interface SquadPlanRun');
  const end = src.indexOf('interface SaveRunCommon');
  assert.ok(start >= 0 && end > start, 'both slice anchors must exist');
  const iface = src.slice(start, end);
  assert.match(iface, /outcome: RunOutcome;/,
    'a run must expose its graded outcome');
  assert.equal(/^\s*ovrAfter\??:/m.test(iface), false,
    'a run must not expose an ungraded scalar ovrAfter');
});
