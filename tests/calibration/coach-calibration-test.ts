import assert from 'node:assert/strict';
import { test } from 'node:test';
import corpusJson from '../../calibration/coach_experiments.v1.json';
import type { CoachCalibrationCorpus } from '../../src/calibration/coachCalibrationTypes';
import { runExperiment } from '../../src/calibration/coachCalibrationRun';
import { validateCorpus } from '../../src/calibration/coachCalibrationValidate';

const corpus = corpusJson as unknown as CoachCalibrationCorpus;

test('coach calibration corpus is structurally valid', () => {
  assert.deepEqual(validateCorpus(corpus), []);
  assert.ok(corpus.experiments.length >= 2, 'calibration corpus must contain at least the original two fixtures');
});

test('production engine is deterministic for the same pre-outcome state', () => {
  for (const experiment of corpus.experiments) {
    assert.deepEqual(runExperiment(experiment), runExperiment(experiment));
  }
});

test('observed outcomes cannot influence production prediction', () => {
  for (const experiment of corpus.experiments) {
    const baseline = runExperiment(experiment).prediction;
    const poisoned = structuredClone(experiment);
    for (const interval of Object.values(poisoned.observed.statIntervals)) {
      interval.lo += 500;
      interval.hi += 500;
    }
    if (poisoned.observed.ovrDelta) {
      poisoned.observed.ovrDelta.lo += 50;
      poisoned.observed.ovrDelta.hi += 50;
    }
    assert.deepEqual(runExperiment(poisoned).prediction, baseline);
  }
});

test('the harness runs the real production route, not the external frozen prediction', () => {
  for (const experiment of corpus.experiments) {
    const result = runExperiment(experiment);
    assert.equal(result.prediction.status, 'projected');
    if (result.prediction.status !== 'projected') continue;
    const external = experiment.externalFrozenPrediction;
    if (!external) continue;
    const differs = Object.entries(external.statIntervals).some(([stat, interval]) => {
      const point = result.prediction.status === 'projected' ? result.prediction.statPoints[stat] : undefined;
      return point !== undefined && (point < interval.lo || point > interval.hi);
    });
    assert.equal(differs, true, 'at least one production point should differ from the old AI-generated interval');
  }
});

test('current baseline exposes the allocation error instead of averaging it away', () => {
  const robertExperiment = corpus.experiments.find(e => e.id === 'EXP-20260911-ROBERT-FOCUSED-OFFENSIVE-X26');
  const rossExperiment = corpus.experiments.find(e => e.id === 'EXP-20260911-ROSS-FOCUSED-OFFENSIVE-X26');
  assert.ok(robertExperiment);
  assert.ok(rossExperiment);
  const robert = runExperiment(robertExperiment);
  const ross = runExperiment(rossExperiment);
  assert.equal(robert.statScores.PASSING.relation, 'above');
  assert.equal(robert.statScores.AGGRESSION.relation, 'below');
  assert.equal(ross.statScores.PASSING.relation, 'above');
  assert.equal(ross.statScores.AGGRESSION.relation, 'below');
});
