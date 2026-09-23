import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fittingWeight, qualityExclusions } from '../tools/resource-coach-v2/quality-exclusions.mjs';

test('unreconciled preview and its duplicate have no fitting weight',()=>{
  for(const id of ['1790098245150-5u2qap7n','1790098535017-6ng4hwdq']){
    const rec=JSON.parse(fs.readFileSync(`calibration/resource-coach-log/runs/${id}.json`,'utf8'));
    assert.ok(qualityExclusions.has(id));
    assert.equal(fittingWeight(rec),0);
  }
  assert.equal(fittingWeight({experiment:{experimentId:'clean-new'},evidence:{isDuplicate:false}}),1);
});

test('generated scores retain diagnostics but exclude the disputed family from fitting',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'resource-coach-aggregate-'));
  try{
    execFileSync(process.execPath,['tools/resource-coach-v2/aggregate-experiment-log.mjs','calibration/resource-coach-log/runs',out]);
    const summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8'));
    assert.equal(summary.qualityExcludedRecords,2);
    assert.ok(Object.values(summary.models).every(m=>m.all_rows===1&&m.fit_rows===0&&m.endpoint_mae===null));
    const csv=fs.readFileSync(path.join(out,'observed_stats.csv'),'utf8');
    assert.match(csv,/class_source/);
    assert.match(csv,/role-map/);
  }finally{fs.rmSync(out,{recursive:true,force:true});}
});

test('source-conflicted historical previews remain inspectable but have zero fitting weight',()=>{
  const ids=['PRV-0017','PRV-0018','PRV-0019','PRV-0020'];
  for(const id of ids) assert.match(qualityExclusions.get(id)??'',/Provenance conflict/);
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'resource-coach-source-review-'));
  try{
    execFileSync(process.execPath,[
      'tools/resource-coach-v2/analyse-longitudinal-corpus.mjs',
      '--corpus-dir','calibration/longitudinal-corpus',
      '--runs-dir','calibration/resource-coach-log/runs',
      '--out-dir',out,
    ]);
    const summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8'));
    assert.equal(summary.empiricalStatIntervals,85);
    assert.equal(summary.variablesWithExactCancellation,0);
    const csv=fs.readFileSync(path.join(out,'variable_identifiability.csv'),'utf8');
    assert.match(csv,/multiplier,6,51,0,0,/);
    assert.ok(summary.uniqueEmpiricalPreviews>=20);
    // The archive remains intact; historical controls use registry fitting weights.
    assert.equal(fittingWeight({experiment:{experimentId:'PRV-0017'},evidence:{isDuplicate:false}}),0);
  }finally{fs.rmSync(out,{recursive:true,force:true});}
});
