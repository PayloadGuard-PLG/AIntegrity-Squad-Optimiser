import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const script = path.resolve('tools/resource-coach-v2/analyse-longitudinal-corpus.mjs');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function runFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-coach-longitudinal-'));
  const corpus = path.join(root, 'corpus');
  const runs = path.join(root, 'runs');
  const out = path.join(root, 'out');

  writeJson(path.join(corpus, 'coach_experiments.v1.json'), {
    schemaVersion: 1,
    experiments: [
      {
        id: 'HIST-A',
        preOutcome: {
          player: { id: 'A', name: 'Alpha', role: ['MC'], age: 19, tier: 'T3', overall: 100, stats: { PASSING: 100, DRIBBLING: 110 } },
          coach: { programmeFamily: 'Drill Session', title: 'Standard Attacking', multiplier: 5, affectedStats: ['PASSING', 'DRIBBLING'], transferClass: 'ordinary' },
        },
        observed: { statIntervals: { PASSING: { lo: 2, hi: 3 }, DRIBBLING: { lo: 4, hi: 5 } }, ovrDelta: { lo: 1, hi: 2 }, stateChanged: false },
      },
      {
        id: 'HIST-B',
        preOutcome: {
          player: { id: 'B', name: 'Beta', role: ['MC'], age: 20, tier: 'T3', overall: 101, stats: { PASSING: 103, DRIBBLING: 108 } },
          coach: { programmeFamily: 'Drill Session', title: 'Standard Attacking', multiplier: 5, affectedStats: ['PASSING', 'DRIBBLING'], transferClass: 'ordinary' },
        },
        observed: { statIntervals: { PASSING: { lo: 3, hi: 4 }, DRIBBLING: { lo: 5, hi: 6 } }, ovrDelta: { lo: 1, hi: 2 }, stateChanged: false },
      },
      {
        id: 'HIST-C',
        preOutcome: {
          player: { id: 'C', name: 'Gamma', role: ['MC'], age: 20, tier: 'T3', overall: 100, stats: { PASSING: 100, DRIBBLING: 110 } },
          coach: { programmeFamily: 'Drill Session', title: 'Standard Attacking', multiplier: 5, affectedStats: ['PASSING', 'DRIBBLING'], transferClass: 'ordinary' },
        },
        observed: { statIntervals: { PASSING: { lo: 2, hi: 3 }, DRIBBLING: { lo: 4, hi: 5 } }, ovrDelta: { lo: 1, hi: 2 }, stateChanged: false },
      },
    ],
  });

  writeJson(path.join(corpus, 'player_seeds.json'), {
    players: [
      { id: 'PLY-A', name: 'Alpha', _stateId: 'STATE-ALPHA-1', _regime: 'CURRENT_TESTBED', age: 19, roles: ['MC'], tier: 'T3', ovr: 100, stats: { PASSING: 100, DRIBBLING: 110 }, last_updated: '2026-09-01' },
      { name: 'Alpha', age: 19, roles: ['MC'], tier: 'T3', ovr: 102, stats: { PASSING: 104, DRIBBLING: 113, FITNESS: 0 }, last_updated: '2026-09-02' },
    ],
  });

  for (const [id, passing, dribbling] of [['RUN-1', 101, 111], ['RUN-2', 102, 112]]) {
    writeJson(path.join(runs, id + '.json'), {
      schemaVersion: 'resource-coach-experiment-v1',
      experiment: {
        experimentId: id,
        playerId: id + '-player',
        status: 'observed',
        input: {
          playerId: id + '-player',
          age: 19,
          tier: 'T3',
          stateKey: JSON.stringify([19, 'T3', ['MC'], [['DRIBBLING', dribbling], ['PASSING', passing]]]),
          coachLabel: 'Standard Attacking',
          multiplier: 5,
          programmeFamily: 'drill-session',
          transferClass: 'ordinary',
          stats: [
            { stat: 'PASSING', displayedStat: passing, displayClass: 'WHITE' },
            { stat: 'DRIBBLING', displayedStat: dribbling, displayClass: 'WHITE' },
          ],
        },
      },
      evidence: { fingerprint: id + '-fingerprint', isDuplicate: false },
      observation: {
        input: {
          playerId: id + '-player',
          age: 19,
          tier: 'T3',
          stateKey: JSON.stringify([19, 'T3', ['MC'], [['DRIBBLING', dribbling], ['PASSING', passing]]]),
          coachLabel: 'Standard Attacking',
          multiplier: 5,
          programmeFamily: 'drill-session',
          transferClass: 'ordinary',
          stats: [
            { stat: 'PASSING', displayedStat: passing, displayClass: 'WHITE' },
            { stat: 'DRIBBLING', displayedStat: dribbling, displayClass: 'WHITE' },
          ],
        },
        intervals: [{ stat: 'PASSING', gainLo: 2, gainHi: 3 }, { stat: 'DRIBBLING', gainLo: 4, gainHi: 5 }],
        ovrBoost: { gainLo: 1, gainHi: 2 },
      },
    });
  }

  execFileSync(process.execPath, [script, '--corpus-dir', corpus, '--runs-dir', runs, '--out-dir', out, '--top-n', '4'], { stdio: 'pipe' });
  return { root, out };
}

test('longitudinal analyser batches every experiment against the whole corpus', () => {
  const { root, out } = runFixture();
  try {
    const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
    assert.equal(summary.currentExperimentRecords, 2);
    assert.equal(summary.currentIntakeRows, 4);
    assert.ok(summary.playerIdentities >= 2);
    assert.ok(summary.stateComparisons >= 1);
    assert.ok(summary.matchRows >= 4);
    assert.equal(summary.discardedNonPositiveStatValues, 1);

    const intake = fs.readFileSync(path.join(out, 'form_intake.csv'), 'utf8');
    assert.match(intake, /RUN-1/);
    assert.match(intake, /RUN-2/);

    const comparisons = fs.readFileSync(path.join(out, 'state_comparisons.csv'), 'utf8');
    assert.match(comparisons, /OBSERVED_STATE_DELTA_NOT_CAUSAL/);
    assert.doesNotMatch(comparisons, /FITNESS:-/);

    const matches = fs.readFileSync(path.join(out, 'experiment_matches.csv'), 'utf8');
    assert.match(matches, /HIST-A|HIST-B/);

    const profiles = fs.readFileSync(path.join(out, 'player_longitudinal_profiles.csv'), 'utf8');
    assert.match(profiles, /Alpha/);
    assert.match(profiles, /MULTI_STATE_OBSERVED_NOT_CAUSAL/);

    const controls = fs.readFileSync(path.join(out, 'corpus_control_pairs.csv'), 'utf8');
    assert.match(controls, /ISOLATED_AGE_NON_CAUSAL/);

    const identifiability = fs.readFileSync(path.join(out, 'variable_identifiability.csv'), 'utf8');
    assert.match(identifiability, /age,/);
    assert.match(identifiability, /EXACT_CANCELLATION_AVAILABLE/);

    assert.match(comparisons, /order_class/);
    assert.match(comparisons, /OBSERVED_TEMPORAL_ORDER|CANONICAL_NON_TEMPORAL_ORDER/);
    assert.match(comparisons, /changed_dimensions/);

    const stateMatches = fs.readFileSync(path.join(out, 'experiment_state_matches.csv'), 'utf8');
    assert.match(stateMatches, /RUN-1/);
    assert.match(stateMatches, /Alpha/);
    assert.match(stateMatches, /STATE-ALPHA-1/);
    assert.match(stateMatches, /STRUCTURAL_MATCH_NEAREST_VECTOR_NOT_IDENTITY/);

    assert.ok(summary.experimentStateMatchRows >= 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('observed interval endpoints remain distinct in generated intake', () => {
  const { root, out } = runFixture();
  try {
    const intake = fs.readFileSync(path.join(out, 'form_intake.csv'), 'utf8');
    assert.match(intake, /observed_lo,observed_hi/);
    assert.match(intake, /nearest_corpus_player_name/);
    assert.doesNotMatch(intake, /midpoint/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
