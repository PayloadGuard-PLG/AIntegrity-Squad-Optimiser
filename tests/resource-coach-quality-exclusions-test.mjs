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
