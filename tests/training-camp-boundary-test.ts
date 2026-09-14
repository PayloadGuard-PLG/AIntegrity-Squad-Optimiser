import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCoachPreview } from '../src/logic/coachPreviewParse';
import { resolveCoachStats } from '../src/logic/coachPipeline';
import { predictResourceCoach, type ResourceInput } from '../src/logic/resourceCoachV2';

const result = {
  text: 'TRAINING CAMP\\nSTANDARD ATTACKING ×13\\nPASSING 134 +24-32\\nCREATIVITY 117 +25-35',
  blocks: [{
    text: 'TRAINING CAMP\\nSTANDARD ATTACKING ×13\\nPASSING 134 +24-32\\nCREATIVITY 117 +25-35',
    lines: [
      { text: 'TRAINING CAMP', frame: { top: 10, left: 0 } },
      { text: 'STANDARD ATTACKING ×13', frame: { top: 30, left: 0 } },
      { text: 'PASSING 134 +24-32', frame: { top: 100, left: 0 } },
      { text: 'CREATIVITY 117 +25-35', frame: { top: 130, left: 0 } },
    ],
  }],
} as any;

test('Training Camp is a source-family observation, never a Resource Coach transfer class', () => {
  const scan = parseCoachPreview(result);
  assert.equal(scan.sourceFamily, 'training-camp');
  assert.equal(scan.transferClass, 'unresolved');
  assert.equal(scan.isTrainingCamp, true);
  assert.equal(scan.multiplier, 13);
  assert.deepEqual(scan.stats.map(s => [s.statName, s.gainLo, s.gainHi]), [
    ['PASSING', 24, 32],
    ['CREATIVITY', 25, 35],
  ]);
});

test('Training Camp never expands Standard/Extensive category shape', () => {
  const scan = parseCoachPreview(result);
  assert.deepEqual(resolveCoachStats(scan, {}, ['ST']).sort(), ['CREATIVITY', 'PASSING']);
});

test('Training Camp cannot enter Resource Coach V2 prediction or calibration domain', () => {
  const input: ResourceInput = {
    playerId: 'training-camp-fixture', age: 26, tier: 'T0', stateKey: 'state',
    sourceFamily: 'training-camp', transferClass: 'unresolved',
    coachLabel: 'Standard Attacking', multiplier: 13,
    stats: [
      { stat: 'PASSING', displayedStat: 134, displayClass: 'WHITE', classSource: 'role-map' },
      { stat: 'CREATIVITY', displayedStat: 117, displayClass: 'WHITE', classSource: 'role-map' },
    ],
  };
  const prediction = predictResourceCoach(input);
  assert.equal(prediction.status, 'unavailable');
  assert.match(prediction.reasons.join(' '), /Training Camp is outside Resource Coach V2/);
});

test('screen wiring preserves Training Camp source and disables transfer relabelling', () => {
  const src = readFileSync('app/(tabs)/coaches.tsx', 'utf8');
  assert.match(src, /setSourceFamily\(scannedSourceFamily\)/);
  assert.match(src, /sourceFamily === 'training-camp'\) return/);
  assert.match(src, /sourceFamily=\{sourceFamily\}/);
  assert.match(src, /TRAINING CAMP · EVIDENCE ONLY · RESOURCE COACH V2 BLOCKED/);
});
