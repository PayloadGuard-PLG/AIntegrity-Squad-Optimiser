import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rowObjects,
  semanticFromSheet,
  semanticFromRun,
  buildRecord,
  digest,
} from '../tools/drive-data-exchange/collect-resource-coach-sheet.mjs';

const exp={
  experiment_id:'e1',player_id:'p1',created_at:'2026-09-22T10:00:00Z',
  partition:'calibration',origin_partition:'',current_partition:'calibration',promoted_at:'',
  status:'observed',observed_at:'2026-09-22T10:05:00Z',
  evidence_fingerprint:'fp',is_duplicate:false,duplicate_of_experiment_id:'',evidence_detected_at:'2026-09-22T10:05:00Z',
  player_age:19,tier:'T3',state_key:'state',source_family:'resource-coach',source_family_source:'manual-confirmed',
  transfer_class:'ordinary',transfer_class_source:'manual-confirmed',coach_label:'Standard Attacking',
  displayed_multiplier:5,programme_family:'drill-session',programme_family_source:'ocr-observed',target_source:'glyph-observed',
};
const obs=[
  {experiment_id:'e1',stat:'PASSING',displayed_stat:252,display_class:'WHITE',gain_lo:1,gain_hi:2,evidence_kind:'observed-interval',evidence_source:'state-confirmed-preview'},
  {experiment_id:'e1',stat:'FINISHING',displayed_stat:153,display_class:'MID_GREY',gain_lo:5,gain_hi:7,evidence_kind:'observed-interval',evidence_source:'state-confirmed-preview'},
];

test('rowObjects maps a header row deterministically',()=>{
  assert.deepEqual(rowObjects([['a','b'],[1,2],[3,'']]),[{a:1,b:2},{a:3,b:''}]);
});

test('sheet record reconstruction creates sealed observed evidence only',()=>{
  const rec=buildRecord(exp,obs,[{
    experiment_id:'e1',event_seq:1,recorded_at:'2026-09-22T10:06:00Z',event_kind:'legacy-snapshot',
    from_partition:'',to_partition:'calibration',note:'test'
  }]);
  assert.equal(rec.schemaVersion,'resource-coach-experiment-v1');
  assert.equal(rec.experiment.status,'observed');
  assert.equal(rec.experiment.input.stats.length,2);
  assert.deepEqual(rec.observation.intervals.map(x=>x.stat),['FINISHING','PASSING']);
  assert.equal(rec.observation.source,'state-confirmed-preview');
});

test('semantic mirror ignores non-evidentiary serialization differences',()=>{
  const rec=buildRecord(exp,obs,[]);
  const a=semanticFromSheet(exp,obs);
  const b=semanticFromRun(rec);
  assert.deepEqual(b,a);
});

test('inconsistent Sheet provenance is rejected',()=>{
  const bad=[...obs.map(x=>({...x}))];
  bad[1].evidence_source='different-source';
  assert.throws(()=>buildRecord(exp,bad,[]),/inconsistent observation provenance/);
});

test('source digest is key-order stable',()=>{
  assert.equal(digest({b:2,a:1}),digest({a:1,b:2}));
});
