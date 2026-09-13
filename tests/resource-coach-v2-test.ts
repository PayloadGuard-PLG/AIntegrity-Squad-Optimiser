import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import reference from './fixtures/resource-coach-v2-synthetic.json';
import { RESOURCE_MODEL, integratedGain, predictResourceCoach, fitPlayerCalibration, inputSignature, validateObservation, type ResourceInput, type ResourceObservation } from '../src/logic/resourceCoachV2';
import { createResourceCoachStore, type ResourceDatabase } from '../src/services/resourceCoachStore';
import { RESOURCE_COACH_SCHEMA } from '../src/db/resourceCoachSchema';
const input: ResourceInput = { playerId:'synthetic-player',age:28,tier:'T0',stateKey:'synthetic-state',transferClass:'ordinary',coachLabel:'Synthetic anchor',multiplier:26,
  stats:reference.anchor.coords.map((value,i)=>({stat:`STAT ${i}`,displayedStat:value,displayClass:'WHITE',classSource:'manual-observed'})) };
const anchorId='synthetic-anchor';
function observation(id: string): ResourceObservation {
  return {id,capturedAt:'2026-09-13',input,evidenceKind:'observed-interval',source:'manual-confirmed-preview',
    intervals:reference.anchor.observed.map((r,i)=>({stat:`STAT ${i}`,gainLo:r[0],gainHi:r[1]}))};
}
test('30 synthetic inputs agree with independent numerical integration across both regimes',()=>{
  for(const r of reference.rows) {
    assert.ok(Math.abs(integratedGain(r.u,r.age,r.exposure)-r.gain[0])<1e-7);
    assert.ok(Math.abs(integratedGain(r.u,r.age,r.exposure,true)-r.gain[1])<1e-7);
  }
  assert.equal(reference.rows.length,30);
});
test('ordered finite endpoints and approximate OVR boost over supported input grid',()=>{
  for(const age of [18,24,28,31,32]) for(const multiplier of [.5,2,26,106]) {
    const p=predictResourceCoach({...input,age,multiplier});
    assert.equal(p.status,'predicted');
    for(const r of p.intervals)assert.ok(Number.isFinite(r.gainLo)&&r.gainLo>=0&&r.gainHi>=r.gainLo);
    assert.equal(p.ovrBoost!.gainHi,p.intervals.reduce((n,r)=>n+r.gainHi,0)/15);
  }
});
test('negative tier coordinate is preserved; cap sits outside white tier addition',()=>{
  assert.ok(integratedGain(-25,28,1)>integratedGain(25,28,1));
  const i={...input,tier:'T6',age:32,stats:[{stat:'FINISHING',displayedStat:407,displayClass:'WHITE' as const,classSource:'manual-observed' as const}]};
  assert.ok(predictResourceCoach(i).intervals[0].gainHi>0);
  assert.equal(predictResourceCoach({...i,stats:[{...i.stats[0],displayedStat:560}]}).intervals[0].gainHi,0);
  assert.equal(predictResourceCoach({...i,stats:[{...i.stats[0],displayClass:'MID_GREY'}]}).intervals[0].gainHi,0);
});
test('reward, unresolved, unknown class and malformed/out-of-support inputs abstain',()=>{
  for(const patch of [{transferClass:'reward'},{transferClass:'unresolved'},{age:33},{age:17},{multiplier:NaN},{multiplier:-1},{multiplier:Infinity},{tier:'T7'},{stats:[]},{stats:[input.stats[0],input.stats[0]]},{stats:[{...input.stats[0],displayClass:'UNKNOWN'}]}]) {
    assert.equal(predictResourceCoach({...input,...patch} as ResourceInput).status,'unavailable');
  }
});
test('exposure uses multiplier/p without ordinary session decay',()=>{
  const s=input.stats[0];
  const a=predictResourceCoach({...input,multiplier:2,stats:[s]}).intervals[0];
  const b=predictResourceCoach({...input,multiplier:4,stats:[s,{...s,stat:'OTHER'}]}).intervals[0];
  assert.deepEqual(a,b);
});
test('two-offset optimizer agrees with independent scipy synthetic-anchor fit',()=>{
  const c=fitPlayerCalibration(observation(anchorId));
  assert.ok(Math.abs(c.logHigh-reference.anchor.offsets[0])<.005);
  assert.ok(Math.abs(c.logLow-reference.anchor.offsets[1])<.005);
});
test('anchor never scores itself, including relabelled/reordered equivalent previews',()=>{
  const c=fitPlayerCalibration(observation(anchorId));
  assert.equal(predictResourceCoach(input,c).mode,'cold-start');
  const same={...input,coachLabel:'Renamed',stats:[...input.stats].reverse().map(s=>({...s,classSource:'role-map' as const}))};
  assert.equal(inputSignature(same),inputSignature(input));
  assert.equal(predictResourceCoach(same,c).mode,'cold-start');
  const target={...input,multiplier:input.multiplier+1};
  assert.equal(predictResourceCoach(target,c).mode,'player-calibrated');
  for(const patch of [{age:input.age+1},{tier:'T6'},{stateKey:'new-season'},{playerId:'other'}]) {
    assert.notEqual(predictResourceCoach({...target,...patch},c).mode,'player-calibrated');
  }
});
test('bad intervals and zero-gain anchors cannot be fitted or silently cleaned',()=>{
  const o=observation(anchorId);
  for(const r of [{gainLo:3,gainHi:2},{gainLo:NaN,gainHi:2},{gainLo:-1,gainHi:2}])assert.throws(()=>validateObservation({...o,intervals:[{stat:o.intervals[0].stat,...r}]}));
  assert.throws(()=>fitPlayerCalibration({...o,intervals:o.intervals.map(r=>({...r,gainLo:0,gainHi:0}))}));
  assert.throws(()=>fitPlayerCalibration({...o,input:{...o.input,transferClass:'reward'}}));
});
function memoryDb(): ResourceDatabase & {raw:DatabaseSync} {
  const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON; CREATE TABLE squad_plan_runs(id TEXT PRIMARY KEY,gains TEXT); INSERT INTO squad_plan_runs VALUES (\'legacy\',\'original\');');
  return {raw,execSync:s=>raw.exec(s),runSync:(s,p=[])=>raw.prepare(s).run(...p),
    getFirstSync:<T>(s:string,p:(string|number|null)[]=[])=>raw.prepare(s).get(...p) as T??null,
    getAllSync:<T>(s:string,p:(string|number|null)[]=[])=>raw.prepare(s).all(...p) as T[],
    withTransactionSync:f=>{raw.exec('BEGIN');try{f();raw.exec('COMMIT');}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
test('native SQLite writer persists predictions, observed bounds, OVR and anchors across restart',()=>{
  const db=memoryDb(),store=createResourceCoachStore(db),o={...observation(anchorId),ovrBoost:{gainLo:2,gainHi:3}};
  store.savePrediction('p1',input,predictResourceCoach(input));store.saveObservation(o);store.saveCalibration(fitPlayerCalibration(o),o);
  const restart=createResourceCoachStore(db);
  assert.equal(restart.calibration(input.playerId)?.anchorId,anchorId);
  const exported=JSON.parse(restart.exportPlayer(input.playerId));assert.equal(exported.predictions.length,1);assert.equal(exported.observations.length,1);
  assert.equal(db.raw.prepare('SELECT boost_hi FROM resource_coach_ovr_observation').get()!.boost_hi,3);
  assert.equal(db.raw.prepare('SELECT gains FROM squad_plan_runs').get()!.gains,'original');
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM resource_coach_model_versions WHERE active=1').get()!.n,1);
  assert.throws(()=>store.saveObservation(o));
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM resource_coach_preview').get()!.n,1);
});
test('orphan OVR inserts fail and bundled migration matches reviewable SQL',()=>{
  assert.equal(RESOURCE_COACH_SCHEMA,readFileSync('drizzle/001_resource_coach_v2.sql','utf8'));
  const db=memoryDb();db.execSync(RESOURCE_COACH_SCHEMA);db.execSync(RESOURCE_COACH_SCHEMA);
  assert.throws(()=>db.raw.prepare('INSERT INTO resource_coach_ovr_observation VALUES (?,?,?,?)').run('missing',1,2,'observed-boost-interval'));
});
