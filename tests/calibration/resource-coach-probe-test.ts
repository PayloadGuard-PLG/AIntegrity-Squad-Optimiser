import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  analyseResourceCoachEvidence,
  exactOutputEqual,
  requiredNextData,
  findObservation,
  ResourceCoachEvidenceCorpus,
} from '../../src/calibration/resourceCoachProbe';

const corpus = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'calibration', 'resource_coach_evidence.v1.json'), 'utf8'),
) as ResourceCoachEvidenceCorpus;

test('resource evidence never launders displayed multiplier into sessions', () => {
  for (const observation of corpus.observations) {
    assert.equal('sessions' in observation, false);
    assert.equal(observation.stateChanged, false);
  }
});

test('programme family is inert in the exact matched Howden x106 pair', () => {
  const camp = findObservation(corpus, 'HOWDEN-X106-TRAINING-CAMP');
  const drill = findObservation(corpus, 'HOWDEN-X106-DRILL-SESSION');
  assert.equal(exactOutputEqual(camp, drill), true);
});

test('Howden x106 -> x114 rejects no multiplier effect', () => {
  const x106 = findObservation(corpus, 'HOWDEN-X106-DRILL-SESSION');
  const x114 = findObservation(corpus, 'HOWDEN-X114-DRILL-SESSION');
  assert.equal(exactOutputEqual(x106, x114), false);
});

test('multiplier response has independent same-state replications already in the corpus', () => {
  const result = analyseResourceCoachEvidence(corpus, 47);
  assert.equal(result.multiplier.independentSameStateReplicationCount, 3);
  assert.equal(result.multiplier.allPairsMatched, true);
  assert.equal(result.multiplier.allPairsShowOutputChange, true);

  const howden = result.multiplier.replications.find(row => row.name === 'HOWDEN');
  const mccluskey = result.multiplier.replications.find(row => row.name === 'MCCLUSKEY');
  const ripley = result.multiplier.replications.find(row => row.name === 'RIPLEY');
  assert.ok(howden && mccluskey && ripley);

  assert.ok(howden.conditionalLatentBudgetQ1.endpointMAE < 1);
  assert.ok(howden.conditionalLatentBudgetQ1.endpointMAE < howden.directOutputScaling.endpointMAE);

  assert.ok(mccluskey.conditionalLatentBudgetQ1.endpointMAE < 1);
  assert.ok(mccluskey.conditionalLatentBudgetQ1.endpointMAE < mccluskey.directOutputScaling.endpointMAE);

  // Ripley's intervals are much wider; q=1 remains admissible but is not
  // strongly discriminative against direct scaling on endpoint error alone.
  assert.ok(ripley.conditionalLatentBudgetQ1.endpointMAE < 2);
  assert.ok(ripley.conditionalLatentBudgetQ1.maxEndpointAbsoluteError < 4);
});

test('conditional 1/p shared-budget model admits the raw 65/106 multiplier ratio on both matched McCluskey stats', () => {
  const result = analyseResourceCoachEvidence(corpus, 47);
  assert.equal(result.allocation.sharedBudgetOneOverP.length, 2);

  for (const row of result.allocation.sharedBudgetOneOverP) {
    assert.equal(row.admitsExpectedMultiplierRatio, true, row.stat);
  }
});


test('probe always returns an explicit prioritized data-requirement summary', () => {
  const requirements = requiredNextData();
  assert.equal(requirements.length, 2);
  assert.equal(requirements[0].priority, 1);
  assert.equal(requirements[0].status, 'required');
  assert.equal(requirements[1].status, 'deferred');
  assert.ok(requirements[0].exactObservation.length > 20);
  assert.ok(requirements[0].holdConstant.length > 0);
  assert.ok(requirements[0].capture.length > 0);

  const result = analyseResourceCoachEvidence(corpus, 47);
  assert.deepEqual(result.dataRequiredNext, requirements);
});
