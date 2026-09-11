import assert from 'node:assert/strict';
import { test } from 'node:test';
import corpusJson from '../../calibration/coach_experiments.v1.json';
import type { CoachCalibrationCorpus } from '../../src/calibration/coachCalibrationTypes';
import { runExperiment } from '../../src/calibration/coachCalibrationRun';

const corpus = corpusJson as unknown as CoachCalibrationCorpus;
const EPS = 1e-9;

function close(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) <= EPS, `${label}: expected ${expected}, got ${actual}`);
}

test('base commit engine reproduces the captured deterministic baseline', () => {
  for (const experiment of corpus.experiments) {
    const baseline = experiment.baselineEnginePrediction;
    if (!baseline) throw new Error(`${experiment.id}: missing baselineEnginePrediction`);
    const result = runExperiment(experiment).prediction;
    assert.equal(result.status, 'projected');
    if (result.status !== 'projected') continue;

    assert.equal(result.profileVersion, baseline.profileVersion);
    close(result.ovrBefore, baseline.ovrBefore, `${experiment.id}.ovrBefore`);
    close(result.ovrDelta, baseline.ovrDelta, `${experiment.id}.ovrDelta`);
    for (const [stat, expected] of Object.entries(baseline.statPoints)) {
      close(result.statPoints[stat] ?? 0, expected, `${experiment.id}.${stat}`);
    }
  }
});
