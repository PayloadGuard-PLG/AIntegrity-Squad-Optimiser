import fs from 'node:fs';
import path from 'node:path';

const src=process.argv[2];
const runsDir=path.resolve(process.argv[3] ?? 'calibration/resource-coach-log/runs');
if(!src){console.error('Usage: node ingest-experiment.mjs <resource-coach-experiment-v1.json> [runsDir]');process.exit(2);}
const rec=JSON.parse(fs.readFileSync(src,'utf8'));
if(rec.schemaVersion!=='resource-coach-experiment-v1') throw new Error(`Unsupported schemaVersion: ${rec.schemaVersion}`);
const id=rec.experiment?.experimentId;
if(!id) throw new Error('Missing experiment.experimentId');
if(rec.experiment?.status!=='observed'||!rec.observation) throw new Error('Only sealed observed experiments may enter the immutable run log.');
const observedAt=Date.parse(rec.experiment.observedAt ?? rec.observation.capturedAt ?? '');
if(!Number.isFinite(observedAt)) throw new Error('Missing/invalid observedAt.');
for(const p of rec.predictions ?? []){
  const t=Date.parse(p.capturedAt ?? '');
  if(!Number.isFinite(t)) throw new Error(`Prediction ${p.predictionId ?? '<unknown>'} lacks capturedAt.`);
  if(t>=observedAt) throw new Error(`Prediction ${p.predictionId ?? '<unknown>'} is not pre-outcome.`);
}
if(rec.evidence?.isDuplicate && !rec.evidence?.duplicateOfExperimentId) throw new Error('Duplicate evidence must identify duplicateOfExperimentId.');
fs.mkdirSync(runsDir,{recursive:true});
const dest=path.join(runsDir,`${id}.json`);
const bytes=JSON.stringify(rec,null,2)+'\n';
if(fs.existsSync(dest)){
  if(fs.readFileSync(dest,'utf8')===bytes){console.log(`No-op: ${dest} already contains the same immutable experiment.`);process.exit(0);}
  throw new Error(`Refusing to overwrite existing experiment ${id}. Corrections require a new experiment/provenance event.`);
}
fs.writeFileSync(dest,bytes,{flag:'wx'});
console.log(dest);
