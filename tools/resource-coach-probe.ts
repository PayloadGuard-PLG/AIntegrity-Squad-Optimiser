import { readFileSync } from 'fs';
import { join } from 'path';
import {
  analyseResourceCoachEvidence,
  DataRequirement,
  ResourceCoachEvidenceCorpus,
} from '../src/calibration/resourceCoachProbe';

const root = join(__dirname, '..');
const corpusPath = join(root, 'calibration', 'resource_coach_evidence.v1.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as ResourceCoachEvidenceCorpus;

const result = analyseResourceCoachEvidence(corpus, 47);

function yesNo(value: boolean) {
  return value ? 'YES' : 'NO';
}

function printRequirement(req: DataRequirement) {
  console.log(`\nP${req.priority} [${req.status.toUpperCase()}] ${req.question}`);
  console.log(`  Exact observation: ${req.exactObservation}`);
  console.log(`  Hold constant: ${req.holdConstant.join('; ')}`);
  console.log(`  Change: ${req.change.join('; ')}`);
  console.log(`  Capture: ${req.capture.join('; ')}`);
  console.log(`  Why: ${req.reason}`);
  console.log(`  Complete when: ${req.completionRule}`);
}

console.log('\n=== RESOURCE COACH IDENTIFICATION SUMMARY ===');
console.log(`Observations loaded: ${corpus.observations.length}`);

console.log('\nProgramme-family matched test');
console.log(`  Matched inputs: ${yesNo(result.programmeFamily.matchedInputs)}`);
console.log(`  Outputs exactly equal: ${yesNo(result.programmeFamily.outputsExactlyEqual)}`);
console.log('  Current reading: programme family is not identified as a transfer variable in the matched Howden x106 pair.');

console.log('\nMultiplier matched tests');
console.log(`  Independent same-state pairs: ${result.multiplier.independentSameStateReplicationCount}`);
for (const row of result.multiplier.replications) {
  console.log(`  ${row.name}: x${row.from} -> x${row.to}`);
  console.log(`    Matched inputs: ${yesNo(row.matchedInputs)}`);
  console.log(`    Output changed: ${yesNo(row.outputChanged)}`);
  console.log(`    Direct-output endpoint MAE: ${row.directOutputScaling.endpointMAE.toFixed(4)}`);
  console.log(`    Conditional latent-budget endpoint MAE (K=${result.conditionalK}, q=1): ${row.conditionalLatentBudgetQ1.endpointMAE.toFixed(4)}`);
  console.log(`    Conditional latent-budget max endpoint error: ${row.conditionalLatentBudgetQ1.maxEndpointAbsoluteError.toFixed(4)}`);
}
console.log(`  Conditional latent-budget transform beats direct scaling on ${result.multiplier.latentBeatsDirectCount}/${result.multiplier.independentSameStateReplicationCount} pairs.`);
console.log('  Collection status: multiplier-response replication already exists; no new x106/x114 screenshot is required.');

console.log('\nAffected-stat allocation probe');
for (const row of result.allocation.sharedBudgetOneOverP) {
  console.log(
    `  ${row.stat}: admitted total-budget ratio ${row.ratio.lo.toFixed(4)}..${row.ratio.hi.toFixed(4)}; ` +
    `raw multiplier ratio=${row.expectedMultiplierRatio.toFixed(4)}; admitted=${yesNo(row.admitsExpectedMultiplierRatio)}`
  );
}
console.log(`  Remaining confounds: ${result.allocation.confounds.join('; ')}`);

console.log('\n=== DATA REQUIRED NEXT ===');
for (const req of result.dataRequiredNext) printRequirement(req);

const required = result.dataRequiredNext.filter(req => req.status === 'required');
console.log('\n=== COLLECTION DECISION ===');
if (required.length === 0) {
  console.log('No additional game observation is currently required before the next analysis step.');
} else {
  console.log(`${required.length} additional game observation type(s) are required before production calibration.`);
  console.log(`Highest priority: P${required[0].priority} — ${required[0].exactObservation}`);
}

console.log('\n=== MACHINE-READABLE RESULT ===');
console.log(JSON.stringify(result, null, 2));
