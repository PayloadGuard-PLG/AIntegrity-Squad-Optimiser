import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const script=path.resolve('tools/drive-data-exchange/promote-reviewed-collection.mjs');
test('reviewed artifact promotion validates source hash and leaves dry run unchanged',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'resource-coach-promotion-test-'));
  const artifact=path.join(root,'artifact'),runs=path.join(root,'repository-runs');
  fs.mkdirSync(path.join(artifact,'raw'),{recursive:true});
  fs.mkdirSync(path.join(artifact,'runs'));
  try{
    const id='PROMOTION-TEST-1',name='fresh.json',fileId='drive-test-id';
    const rec=JSON.parse(fs.readFileSync('calibration/resource-coach-log/runs/1790098245150-5u2qap7n.json','utf8'));
    rec.experiment.experimentId=id;rec.experiment.playerId='test-player';rec.evidence={fingerprint:'new-test-fingerprint',isDuplicate:false};
    rec.observation.id=id;
    rec.predictions=[];rec.scores=[];rec.residuals=[];
    const bytes=Buffer.from(JSON.stringify(rec));
    fs.writeFileSync(path.join(artifact,'raw',`${fileId}__${name}`),bytes);
    fs.writeFileSync(path.join(artifact,'runs',`${id}.json`),JSON.stringify(rec,null,2)+'\n');
    const manifest={summary:{schemaVersion:'drive-data-collection-summary-v1',results:{newExperiments:1,rejected:0}},files:[{
      status:'STAGED_NEW_IMMUTABLE_EXPERIMENT',experiment_id:id,drive_file_id:fileId,drive_name:name,
      sha256:crypto.createHash('sha256').update(bytes).digest('hex')}]};
    fs.writeFileSync(path.join(artifact,'collection-manifest.json'),JSON.stringify(manifest));
    const invoke=(extra=[])=>JSON.parse(execFileSync(process.execPath,[script,'--artifact-dir',artifact,'--runs-dir',runs,...extra],{encoding:'utf8'}));
    assert.equal(invoke().wouldPromote,1);
    assert.equal(fs.existsSync(runs),false);
    assert.equal(invoke(['--apply']).promoted,1);
    assert.equal(invoke(['--apply']).alreadyPresent,1);
    fs.writeFileSync(path.join(artifact,'raw',`${fileId}__${name}`),'tampered');
    assert.throws(()=>invoke(),/source hash changed/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
