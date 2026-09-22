import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import reference from './fixtures/resource-coach-v2-synthetic.json';
import { RESOURCE_MODEL, integratedGain, predictResourceCoach, fitPlayerCalibration, inputSignature, validateObservation, buildResourceStatsFromState, resourceStateConfirmed, type ResourceInput, type ResourceObservation } from '../src/logic/resourceCoachV2';
import { RESOURCE_CALIBRATION_CANDIDATE, candidateAgeScale, candidateTierCoordinate, candidateDose, latentMovement, displayedGainFromLatent, predictCalibrationCandidate } from '../src/logic/resourceCoachCandidate';
import { createResourceCoachStore, type ResourceDatabase } from '../src/services/resourceCoachStore';
import { RESOURCE_COACH_SCHEMA } from '../src/db/resourceCoachSchema';
import { scorePrediction } from '../src/logic/resourceCoachExperiment';
const input: ResourceInput = {
  playerId:'synthetic-player',age:28,tier:'T0',stateKey:'synthetic-state',
  sourceFamily:'resource-coach',sourceFamilySource:'manual-confirmed',
  transferClass:'ordinary',transferClassSource:'manual-confirmed',
  programmeFamily:'drill-session',programmeFamilySource:'manual-confirmed',
  targetSource:'manual-confirmed',
  coachLabel:'Synthetic anchor',multiplier:26,
  stats:reference.anchor.coords.map((value,i)=>({stat:`STAT ${i}`,displayedStat:value,displayClass:'WHITE',classSource:'manual-observed'}))
};
const anchorId='synthetic-anchor';
function observation(id: string): ResourceObservation {
  return {id,capturedAt:'2026-09-13',input,evidenceKind:'observed-interval',source:'manual-confirmed-preview',
    intervals:reference.anchor.observed.map((r,i)=>({stat:`STAT ${i}`,gainLo:r[0],gainHi:r[1]}))};
}

test('coach classes are derived from canonical established-role state without a second confirmation gate',()=>{
  const values={TACKLING:181,MARKING:167,POSITIONING:181,HEADING:200,BRAVERY:160,SHOOTING:253};
  const rows=buildResourceStatsFromState(['AML','AMC','MC'],values,['TACKLING','MARKING','POSITIONING','HEADING','BRAVERY','SHOOTING']);
  assert.equal(resourceStateConfirmed(['AML','AMC','MC'],values,rows),true);
  assert.equal(rows.find(r=>r.stat==='SHOOTING')!.displayClass,'WHITE');
  assert.equal(rows[0].classSource,'role-map');

  const wrong=rows.map(r=>r.stat==='TACKLING'?{...r,displayClass:'MID_GREY' as const}:r);
  assert.equal(resourceStateConfirmed(['AML','AMC','MC'],values,wrong),false);
  const manual=wrong.map(r=>r.stat==='TACKLING'?{...r,classSource:'manual-observed' as const}:r);
  assert.equal(resourceStateConfirmed(['AML','AMC','MC'],values,manual),true);
});

test('21 Sep candidate preserves tier coordinate, age bands and below-zero rectification',()=>{
  assert.equal(candidateTierCoordinate(135,'T3','WHITE'),85);
  assert.equal(candidateTierCoordinate(135,'T3','MID_GREY'),135);
  assert.deepEqual([18,22,26,30,32].map(candidateAgeScale),[8,6,4,2,1]);

  const latent=latentMovement(-25,'WHITE',10);
  assert.equal(displayedGainFromLatent(-25,latent),0);
  const enough=latentMovement(-25,'WHITE',40);
  assert.ok(displayedGainFromLatent(-25,enough)>0);
});

test('candidate dose separates multiplier, affected-stat count and Reward scale without hidden compensation',()=>{
  const one={...input,age:21,multiplier:20,transferClass:'ordinary' as const,stats:[input.stats[0]]};
  const five={...one,stats:[...input.stats.slice(0,5)]};
  const reward={...one,transferClass:'reward' as const};
  const d1=candidateDose(one)!;
  const d5=candidateDose(five)!;
  const dr=candidateDose(reward)!;
  assert.ok(d1>d5);
  assert.ok(Math.abs(dr/d1-RESOURCE_CALIBRATION_CANDIDATE.dose.rewardScale)<1e-12);
  assert.equal(candidateDose({...one,transferClass:'unresolved'}),null);
});

test('calibration candidate emits finite ordered intervals and keeps programme family metadata non-causal',()=>{
  const base={...input,age:21,tier:'T3',multiplier:20,transferClass:'ordinary' as const,
    programmeFamily:'drill-session' as const,
    stats:[
      {stat:'TACKLING',displayedStat:181,displayClass:'WHITE' as const,classSource:'role-map' as const},
      {stat:'MARKING',displayedStat:167,displayClass:'WHITE' as const,classSource:'role-map' as const},
      {stat:'POSITIONING',displayedStat:181,displayClass:'WHITE' as const,classSource:'role-map' as const},
      {stat:'HEADING',displayedStat:200,displayClass:'WHITE' as const,classSource:'role-map' as const},
      {stat:'BRAVERY',displayedStat:160,displayClass:'WHITE' as const,classSource:'role-map' as const},
    ]};
  const drill=predictCalibrationCandidate(base);
  const skill=predictCalibrationCandidate({...base,programmeFamily:'skill-seminar'});
  assert.equal(drill.status,'predicted');
  assert.deepEqual(skill.intervals,drill.intervals);
  for(const r of drill.intervals) assert.ok(Number.isFinite(r.gainLo)&&r.gainLo>=0&&r.gainHi>=r.gainLo);
  assert.equal(drill.ovrBoost!.gainHi,drill.intervals.reduce((n,r)=>n+r.gainHi,0)/15);
});
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
  for(const patch of [{sourceFamily:'training-camp'},{sourceFamily:'unresolved'},{transferClass:'reward'},{transferClass:'unresolved'},{age:33},{age:17},{multiplier:NaN},{multiplier:-1},{multiplier:Infinity},{tier:'T7'},{stats:[]},{stats:[input.stats[0],input.stats[0]]},{stats:[{...input.stats[0],displayClass:'UNKNOWN'}]}]) {
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
  assert.throws(()=>fitPlayerCalibration({...o,input:{...o.input,sourceFamily:'training-camp',transferClass:'unresolved'}}));
});
function memoryDb(): ResourceDatabase & {raw:DatabaseSync} {
  const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON; CREATE TABLE squad_plan_runs(id TEXT PRIMARY KEY,gains TEXT); INSERT INTO squad_plan_runs VALUES (\'legacy\',\'original\');');
  return {raw,execSync:s=>raw.exec(s),runSync:(s,p=[])=>raw.prepare(s).run(...p),
    getFirstSync:<T>(s:string,p:(string|number|null)[]=[])=>raw.prepare(s).get(...p) as T??null,
    getAllSync:<T>(s:string,p:(string|number|null)[]=[])=>raw.prepare(s).all(...p) as T[],
    withTransactionSync:f=>{raw.exec('BEGIN');try{f();raw.exec('COMMIT');}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
test('native SQLite writer isolates experiments, freezes predictions, scores residuals and gates calibration promotion',()=>{
  const db=memoryDb(),store=createResourceCoachStore(db),o={...observation(anchorId),ovrBoost:{gainLo:2,gainHi:3}};
  store.savePrediction(anchorId,'p1',input,predictResourceCoach(input),'prospective-holdout');
  store.saveCandidatePrediction(anchorId,'candidate-1',input,predictCalibrationCandidate(input),'prospective-holdout');
  const scores=store.saveObservation(o,'prospective-holdout');
  assert.equal(scores.length,2);
  assert.ok(scores.every(s=>s.status==='scored'));
  assert.ok(scores.every(s=>s.endpointMae!==null&&Number.isFinite(s.endpointMae)));
  assert.throws(()=>store.savePrediction(anchorId,'late',input,predictResourceCoach(input)));
  assert.throws(()=>store.saveCalibration(fitPlayerCalibration(o),o),/promote/i);
  assert.equal(store.setExperimentPartition(anchorId,'calibration'),'calibration');
  store.saveCalibration(fitPlayerCalibration(o),o);

  const restart=createResourceCoachStore(db);
  assert.equal(restart.calibration(input.playerId)?.anchorId,anchorId);
  const isolated=JSON.parse(restart.exportExperiment(anchorId));
  assert.equal(isolated.experiment.experimentId,anchorId);
  assert.equal(isolated.experiment.partition,'calibration');
  assert.equal(isolated.predictions.length,2);
  assert.equal(isolated.scores.length,2);
  assert.ok(isolated.predictions.some((p:{modelVersion:string})=>p.modelVersion===RESOURCE_CALIBRATION_CANDIDATE.modelVersion));

  const second={...observation('second-experiment'),capturedAt:'2026-09-14'};
  store.saveObservation(second,'retrospective');
  const isolatedAgain=JSON.parse(store.exportExperiment(anchorId));
  assert.equal(isolatedAgain.observation.id,anchorId);
  assert.equal(isolatedAgain.experiment.experimentId,anchorId);
  const corpus=JSON.parse(store.exportPlayer(input.playerId));
  assert.equal(corpus.experiments.length,2);
  assert.equal(corpus.experiments.filter((e:any)=>e.experiment.experimentId===anchorId).length,1);

  assert.equal(db.raw.prepare('SELECT boost_hi FROM resource_coach_ovr_observation WHERE observation_id=?').get(anchorId)!.boost_hi,3);
  const observedRow=db.raw.prepare('SELECT transfer_class_source,coach_family,source_ref FROM resource_coach_observation WHERE observation_id=? LIMIT 1').get(anchorId)!;
  assert.equal(observedRow.transfer_class_source,'manual-confirmed');
  assert.equal(observedRow.coach_family,'drill-session');
  assert.deepEqual(JSON.parse(String(observedRow.source_ref)),{
    evidenceSource:'manual-confirmed-preview',
    targetSource:'manual-confirmed',
    sourceFamilySource:'manual-confirmed',
    programmeFamilySource:'manual-confirmed',
  });
  assert.equal(db.raw.prepare('SELECT gains FROM squad_plan_runs').get()!.gains,'original');
  assert.deepEqual(db.raw.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM resource_coach_model_versions WHERE active=1').get()!.n,1);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM resource_coach_preview').get()!.n,2);
});

test('interval scoring is deterministic and keeps endpoint, midpoint, width and overlap errors separate',()=>{
  const o:ResourceObservation={...observation('score-only'),intervals:[
    {stat:'A',gainLo:1,gainHi:3},
    {stat:'B',gainLo:4,gainHi:6},
  ],input:{...input,stats:[
    {stat:'A',displayedStat:100,displayClass:'WHITE',classSource:'manual-observed'},
    {stat:'B',displayedStat:100,displayClass:'WHITE',classSource:'manual-observed'},
  ]}};
  const score=scorePrediction({modelVersion:'test',status:'predicted',intervals:[
    {stat:'A',gainLo:2,gainHi:4},
    {stat:'B',gainLo:4,gainHi:6},
  ]},o);
  assert.equal(score.status,'scored');
  assert.equal(score.matchedStatCount,2);
  assert.equal(score.endpointMae,.5);
  assert.equal(score.midpointMae,.5);
  assert.ok(Math.abs(score.meanIntervalIou-(2/3))<1e-12);
  assert.equal(score.residuals[0].lowError,1);
  assert.equal(score.residuals[0].highError,1);
  assert.equal(score.residuals[0].widthError,0);
});

test('orphan OVR inserts fail and bundled migration matches reviewable SQL',()=>{
  assert.equal(RESOURCE_COACH_SCHEMA.replace(/\r\n?/g,'\n'),readFileSync('drizzle/001_resource_coach_v2.sql','utf8').replace(/\r\n?/g,'\n'));
  const db=memoryDb();db.execSync(RESOURCE_COACH_SCHEMA);db.execSync(RESOURCE_COACH_SCHEMA);
  assert.throws(()=>db.raw.prepare('INSERT INTO resource_coach_ovr_observation VALUES (?,?,?,?)').run('missing',1,2,'observed-boost-interval'));
});
