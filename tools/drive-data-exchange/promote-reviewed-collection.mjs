import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args=process.argv.slice(2);
function option(name){const i=args.indexOf(name);return i<0?null:args[i+1];}
const artifact=option('--artifact-dir');
const runsDir=path.resolve(option('--runs-dir')??'calibration/resource-coach-log/runs');
const apply=args.includes('--apply');
if(!artifact)throw new Error('Usage: node promote-reviewed-collection.mjs --artifact-dir <downloaded-artifact> [--runs-dir <directory>] [--apply]');
const root=path.resolve(artifact);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'collection-manifest.json'),'utf8'));
if(manifest.summary?.schemaVersion!=='drive-data-collection-summary-v1')throw new Error('Unexpected collection manifest schema.');
if(manifest.summary.results?.rejected)throw new Error('Collection has rejected source files; review and resolve before promotion.');
const sheetFile=path.join(root,'sheet-source-manifest.json');
const sheet=fs.existsSync(sheetFile)?JSON.parse(fs.readFileSync(sheetFile,'utf8')):null;
if(sheet&&(sheet.summary?.mirrorConflicts||sheet.summary?.invalid))throw new Error('Sheet source has conflicts or invalid rows.');
const candidates=[];
for(const f of manifest.files??[]){
  if(f.status!=='STAGED_NEW_IMMUTABLE_EXPERIMENT')continue;
  if(!f.experiment_id||!f.sha256||!f.drive_file_id||!f.drive_name)throw new Error('New Drive record lacks identity or source hash.');
  const raw=path.join(root,'raw',`${String(f.drive_file_id).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,180)}__${String(f.drive_name).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,180)}`);
  const digest=crypto.createHash('sha256').update(fs.readFileSync(raw)).digest('hex');
  if(digest!==f.sha256)throw new Error(`Drive source hash changed for ${f.experiment_id}.`);
  candidates.push(f.experiment_id);
}
for(const f of sheet?.records??[])if(f.status==='STAGED_NEW_SHEET_EXPERIMENT')candidates.push(f.experiment_id);
if(new Set(candidates).size!==candidates.length)throw new Error('Repeated experiment ID in collection manifests.');
if(candidates.length!==(manifest.summary.results?.newExperiments??0)+(sheet?.summary?.newExperiments??0))throw new Error('New experiment count differs from collection manifest.');
const staged=[];
for(const id of candidates){
  if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error('Unsafe experiment ID in collection manifest.');
  const src=path.join(root,'runs',`${id}.json`);
  const rec=JSON.parse(fs.readFileSync(src,'utf8'));
  if(rec.schemaVersion!=='resource-coach-experiment-v1'||rec.experiment?.experimentId!==id||rec.experiment?.status!=='observed')throw new Error(`Invalid staged experiment ${id}.`);
  const dest=path.join(runsDir,`${id}.json`);
  if(fs.existsSync(dest)){
    if(fs.readFileSync(dest,'utf8')!==fs.readFileSync(src,'utf8'))throw new Error(`Immutable experiment ${id} conflicts with repository.`);
    continue;
  }
  staged.push({id,src,dest});
}
// Validate every proposed run before writing any repository file.
const validationDir=fs.mkdtempSync(path.join(process.cwd(),'resource-coach-promotion-'));
try{
  for(const f of staged)execFileSync(process.execPath,[path.resolve('tools/resource-coach-v2/ingest-experiment.mjs'),f.src,validationDir],{stdio:'pipe'});
}finally{fs.rmSync(validationDir,{recursive:true,force:true});}
if(apply){
  fs.mkdirSync(runsDir,{recursive:true});
  for(const f of staged)fs.copyFileSync(f.src,f.dest,fs.constants.COPYFILE_EXCL);
}
console.log(JSON.stringify({artifact:root,reviewRequired:!apply,candidateIds:candidates,alreadyPresent:candidates.length-staged.length,promoted:apply?staged.length:0,wouldPromote:apply?0:staged.length},null,2));
