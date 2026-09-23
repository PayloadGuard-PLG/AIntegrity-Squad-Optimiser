import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../calibration/resource-coach-log/quality-exclusions.json');
const data=JSON.parse(fs.readFileSync(file,'utf8'));
if(data.schemaVersion!=='resource-coach-quality-exclusions-v1'||!Array.isArray(data.experiments))throw new Error('Invalid resource-coach quality exclusion registry.');
export const qualityExclusions=new Map();
for(const entry of data.experiments){
  if(!entry.experimentId||!entry.reason||qualityExclusions.has(entry.experimentId))throw new Error('Invalid or duplicate quality exclusion.');
  qualityExclusions.set(entry.experimentId,entry.reason);
}
export function fittingWeight(rec){return rec.evidence?.isDuplicate||qualityExclusions.has(rec.experiment?.experimentId)?0:1;}
