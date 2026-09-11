import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CoachCalibrationCorpus, ScoredExperiment } from '../src/calibration/coachCalibrationTypes';
import { runCorpus } from '../src/calibration/coachCalibrationRun';

function valueAfter(flag: string, args: string[]): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function relationGlyph(relation: 'below' | 'inside' | 'above'): string {
  return relation === 'inside' ? 'IN' : relation === 'below' ? 'LOW' : 'HIGH';
}

function printHuman(result: ScoredExperiment): void {
  console.log(`\n${result.experimentId}`);
  if (result.prediction.status === 'unavailable') {
    console.log(`  engine: UNAVAILABLE (${result.prediction.transferClass}) ${result.prediction.reasonCodes.join(', ')}`);
    return;
  }

  console.log(`  engine OVR before: ${fmt(result.prediction.ovrBefore)} | stored player OVR: ${fmt(result.prediction.ovrBefore - (result.baselineOvrDrift ?? 0))} | drift: ${fmt(result.baselineOvrDrift ?? 0)}`);
  for (const [stat, score] of Object.entries(result.statScores)) {
    console.log(
      `  ${stat.padEnd(12)} predicted ${fmt(score.point).padStart(5)} | observed ${fmt(score.observed.lo)}-${fmt(score.observed.hi)} | ${relationGlyph(score.relation)} | midpoint residual ${score.midpointResidual >= 0 ? '+' : ''}${fmt(score.midpointResidual)}`,
    );
  }
  if (result.ovrScore) {
    const score = result.ovrScore;
    console.log(
      `  ${'OVR'.padEnd(12)} predicted ${fmt(score.point).padStart(5)} | observed ${fmt(score.observed.lo)}-${fmt(score.observed.hi)} | ${relationGlyph(score.relation)} | midpoint residual ${score.midpointResidual >= 0 ? '+' : ''}${fmt(score.midpointResidual)}`,
    );
  }
}

const args = process.argv.slice(2);
const corpusPath = resolve(process.cwd(), valueAfter('--corpus', args) ?? 'calibration/coach_experiments.v1.json');
const requestedId = valueAfter('--id', args);
const asJson = args.includes('--json');

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as CoachCalibrationCorpus;
const selected: CoachCalibrationCorpus = requestedId
  ? { ...corpus, experiments: corpus.experiments.filter(experiment => experiment.id === requestedId) }
  : corpus;

if (requestedId && selected.experiments.length === 0) {
  throw new Error(`No calibration experiment named ${requestedId}`);
}

const results = runCorpus(selected);
if (asJson) {
  console.log(JSON.stringify({ baseCommit: corpus.baseCommit, results }, null, 2));
} else {
  console.log(`Coach calibration harness | corpus base ${corpus.baseCommit.slice(0, 12)} | ${results.length} experiment(s)`);
  results.forEach(printHuman);

  const statScores = results.flatMap(result => Object.values(result.statScores));
  const inRange = statScores.filter(score => score.relation === 'inside').length;
  const midpointMae = statScores.length
    ? statScores.reduce((sum, score) => sum + score.absoluteMidpointError, 0) / statScores.length
    : 0;
  console.log(`\nSummary: ${inRange}/${statScores.length} stat points inside observed intervals | midpoint MAE ${midpointMae.toFixed(2)}`);
}
