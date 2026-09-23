import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const analyzer = path.resolve('tools/resource-coach-v2/analyze-longitudinal-corpus.mjs');
const STATS = ['TACKLING','MARKING','POSITIONING','HEADING','BRAVERY','PASSING','DRIBBLING','CROSSING','SHOOTING','FINISHING','FITNESS','STRENGTH','AGGRESSION','SPEED','CREATIVITY'];
function stateStats(stateId, playerId, base) {
  return STATS.map((stat,i)=>({player_state_id:stateId,player_id:playerId,stat_name:stat,stat_value:base+i,display_class:i<8?'WHITE':'MID_GREY',observed:true}));
}
function corpusFixture() {
  const playerStates=[
    {player_state_id:'S1',player_id:'P1',player_name:'One',age:20,tier_internal:'T0',ovr:100,established_roles:'MC',stat_schema:'OUTFIELD: '+STATS.join('|'),state_complete:true,sequence_no:1,experimental_regime:'HISTORICAL_CALIBRATION'},
    {player_state_id:'S2',player_id:'P1',player_name:'One',age:20,tier_internal:'T0',ovr:101,established_roles:'MC',stat_schema:'OUTFIELD: '+STATS.join('|'),state_complete:true,sequence_no:2,experimental_regime:'CURRENT_TESTBED',previous_player_state_id:'S1',previous_link_type:'PREVIOUS_OBSERVED_STATE_NOT_ASSERTED_DIRECT_TRANSITION'},
    {player_state_id:'S3',player_id:'P2',player_name:'Two',age:21,tier_internal:'T0',ovr:102,established_roles:'MC',stat_schema:'OUTFIELD: '+STATS.join('|'),state_complete:true,sequence_no:1,experimental_regime:'CURRENT_TESTBED'},
  ];
  const playerStateStats=[...stateStats('S1','P1',80),...stateStats('S2','P1',81),...stateStats('S3','P2',82)];
  const data={
    players:[{player_id:'P1',player_name:'One'},{player_id:'P2',player_name:'Two'}],playerStates,playerStateStats,
    coachDefinitions:[{coach_id:'C1',coach_title:'Standard Attacking',coach_class:'Standard',multiplier:5,transfer_class:'ordinary',reward_status:false}],
    coachInstances:[{coach_instance_id:'I1',coach_id:'C1',coach_title_observed:'Standard Attacking',coach_class_observed:'Standard',multiplier_observed:5}],
    coachAffectedStats:[{coach_id:'C1',coach_instance_id:'I1',stat_name:'PASSING',affected:true}],
    coachPreviews:[{preview_id:'V1',player_id:'P1',player_state_id:'S1',coach_id:'C1',coach_instance_id:'I1'}],
    coachPreviewStats:[{preview_id:'V1',player_state_id:'S1',coach_instance_id:'I1',stat_name:'PASSING',current_value:85,display_class:'WHITE',coach_affected:true,gain_lo:4,gain_hi:6,gain_observed:true}],
    trainingEvents:[],trainingStatDeltas:[],stateTransitions:[],provenance:[]
  };
  return {schemaVersion:'squad-optimiser-longitudinal-corpus-v1',source:{},counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),data};
}

test('corpus-wide pass preserves non-causal longitudinal semantics and evaluates all runs',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'longitudinal-test-'));
  const corpusPath=path.join(tmp,'corpus.json'), runs=path.join(tmp,'runs'), out=path.join(tmp,'out');
  fs.mkdirSync(runs);
  fs.writeFileSync(corpusPath,JSON.stringify(corpusFixture()));
  const entries=STATS.map((s,i)=>[s,82+i]);
  fs.writeFileSync(path.join(runs,'E1.json'),JSON.stringify({
    schemaVersion:'resource-coach-experiment-v1',
    experiment:{experimentId:'E1',playerId:'app-player',partition:'prospective-holdout',status:'observed',observedAt:'2026-09-23T00:00:00Z',input:{playerId:'app-player',age:21,tier:'T0',stateKey:JSON.stringify([21,'T0',['MC'],entries]),transferClass:'ordinary',coachLabel:'Standard Attacking',multiplier:5,stats:[{stat:'PASSING',displayedStat:87,displayClass:'WHITE'}]}},
    evidence:{isDuplicate:false},observation:{intervals:[{stat:'PASSING',gainLo:5,gainHi:7}]},scores:[]
  }));
  execFileSync(process.execPath,[analyzer,corpusPath,runs,out],{stdio:'pipe'});
  const summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8'));
  assert.equal(summary.analysisScope,'all-corpus-states-and-all-immutable-runs');
  assert.equal(summary.counts.players,2);
  assert.equal(summary.counts.playerStates,3);
  assert.equal(summary.counts.samePlayerStatePairs,1);
  assert.equal(summary.counts.linkedLongitudinalPairs,1);
  assert.equal(summary.counts.verifiedDirectTransitions,0);
  assert.equal(summary.integrity.noInferredCausalTransitions,true);
  assert.equal(summary.counts.immutableExperimentRuns,1);
  const metrics=fs.readFileSync(path.join(out,'experiment_metrics.csv'),'utf8');
  assert.match(metrics,/E1/);
  assert.match(metrics,/S3/);
});
