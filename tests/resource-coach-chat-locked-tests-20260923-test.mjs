import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const evidence=JSON.parse(fs.readFileSync('calibration/resource-coach-identification/chat-locked-tests-20260923.json','utf8'));
const candidate=JSON.parse(fs.readFileSync('calibration/resource-coach-identification/live-calibration-candidate-20260923.json','utf8'));

function midpoint([lo,hi]){return (lo+hi)/2;}
function iou(a,b){
  const intersection=Math.max(0,Math.min(a[1],b[1])-Math.max(a[0],b[0]));
  const union=Math.max(a[1],b[1])-Math.min(a[0],b[0]);
  return union===0?1:intersection/union;
}
function endpointAbs(pred,obs){return (Math.abs(pred[0]-obs[0])+Math.abs(pred[1]-obs[1]))/2;}

test('23 Sep evidence preserves prediction-before-outcome chat ordering without invented timestamps',()=>{
  assert.equal(evidence.schemaVersion,'resource-coach-chat-locked-tests-v1');
  assert.equal(evidence.tests.length,5);
  assert.equal(evidence.provenance.absolutePredictionTimestampsAvailable,false);
  for(const t of evidence.tests){
    assert.equal(t.lockProvenance.sequence,'prediction-before-outcome-in-chat');
    assert.equal(t.lockProvenance.absoluteTimestamp,null);
    for(const s of t.affectedStats){
      assert.ok(s.prediction[0] <= s.prediction[1]);
      assert.ok(s.observed[0] <= s.observed[1]);
    }
  }
});

test('Ferguson Standard Attacking x33 Skill Seminar locked point estimates all land inside observed intervals',()=>{
  const t=evidence.tests.find(x=>x.testId==='CHAT-20260923-FERGUSON-STD-ATK-X33-SKILL');
  assert.ok(t);
  assert.equal(t.affectedStats.length,4);
  for(const s of t.affectedStats) assert.ok(s.point>=s.observed[0]&&s.point<=s.observed[1],s.stat);
  assert.ok(t.ovr.point>=t.ovr.observed[0]&&t.ovr.point<=t.ovr.observed[1]);
  const statMae=t.affectedStats.reduce((a,s)=>a+endpointAbs(s.prediction,s.observed),0)/t.affectedStats.length;
  assert.equal(Number(statMae.toFixed(3)),3.875);
});

test('Ferguson Reward x4 exposes within-preview Tackling/Marking allocation skew',()=>{
  const t=evidence.tests.find(x=>x.testId==='CHAT-20260923-FERGUSON-FOC-DEF-X4-DRILL-REWARD');
  const tack=t.affectedStats.find(s=>s.stat==='TACKLING').observed;
  const mark=t.affectedStats.find(s=>s.stat==='MARKING').observed;
  const lowRatio=tack[0]/mark[0], highRatio=tack[1]/mark[1];
  assert.ok(lowRatio>=1.36&&lowRatio<=1.41);
  assert.ok(highRatio>=1.35&&highRatio<=1.41);
  assert.deepEqual(t.ovr.observed,[1,2]);
});

test('Focused Skill x20 p1 invalidates the previous 0.70 working scale under the held predictor',()=>{
  const t=evidence.tests.find(x=>x.testId==='CHAT-20260923-FERGUSON-FOC-DEF-X20-SKILL');
  const stat=t.affectedStats[0];
  assert.equal(t.coach.affectedStatCount,1);
  assert.ok(iou(stat.prediction,stat.observed)===0);
  const implied=0.70*(midpoint(stat.observed)/stat.point);
  assert.ok(implied>0.94&&implied<0.96);
  const h=candidate.hypotheses.find(x=>x.id==='H-SKILL-FOCUSED-SCALE');
  assert.deepEqual(h.testRange,[0.90,1.00]);
  assert.equal(h.status,'previous-0.70-falsified-as-working-scalar');
});

test('candidate remains explicitly test-only and keeps weak/confounded terms bounded',()=>{
  assert.equal(candidate.status,'testing-only-not-production');
  const age=candidate.hypotheses.find(x=>x.id==='H-AGE-19-TO-21-SKILL');
  assert.equal(age.status,'weak-confounded-hypothesis');
  const alloc=candidate.hypotheses.find(x=>x.id==='H-REWARD-DRILL-ALLOCATION');
  assert.equal(alloc.status,'replication-required');
  const q=candidate.hypotheses.find(x=>x.id==='H-SKILL-Q');
  assert.equal(q.status,'conditional-diagnostic');
});
