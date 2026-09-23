import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const corpusDir = path.resolve(arg('--corpus-dir', 'calibration/resource-coach-corpus'));
const runsDir = path.resolve(arg('--runs-dir', 'calibration/resource-coach-log/runs'));
const outDir = path.resolve(arg('--out-dir', 'calibration/resource-coach-log/generated-longitudinal'));
const topN = Number(arg('--top-n', '12'));
if (!Number.isInteger(topN) || topN < 1 || topN > 100) throw new Error('--top-n must be an integer between 1 and 100');

const STAT_ALIASES = new Map([
  ['TACKLING','TACKLING'],['MARKING','MARKING'],['POSITIONING','POSITIONING'],['HEADING','HEADING'],['BRAVERY','BRAVERY'],
  ['PASSING','PASSING'],['DRIBBLING','DRIBBLING'],['CROSSING','CROSSING'],['SHOOTING','SHOOTING'],['FINISHING','FINISHING'],
  ['FITNESS','FITNESS'],['STRENGTH','STRENGTH'],['AGGRESSION','AGGRESSION'],['SPEED','SPEED'],['CREATIVITY','CREATIVITY'],
  ['REFLEXES','REFLEXES'],['AGILITY','AGILITY'],['ANTICIPATION','ANTICIPATION'],['RUSHING OUT','RUSHING OUT'],
  ['COMMUNICATION','COMMUNICATION'],['THROWING','THROWING'],['KICKING','KICKING'],['PUNCHING','PUNCHING'],['AERIAL REACH','AERIAL REACH'],['CONCENTRATION','CONCENTRATION'],
]);
function normStat(v){ if(v===null||v===undefined)return null; const s=String(v).trim().toUpperCase().replace(/\s+/g,' '); return STAT_ALIASES.get(s) ?? s; }
function normText(v){ return v===null||v===undefined ? '' : String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function finite(v){ return typeof v === 'number' && Number.isFinite(v); }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function ageBand(age){ const a=num(age); if(a===null)return 'unknown'; if(a<=21)return '17-21'; if(a<=25)return '22-25'; if(a<=29)return '26-29'; if(a<=31)return '30-31'; return '32+'; }
function q(v){ if(v===null||v===undefined)return ''; const s=typeof v==='object'?JSON.stringify(v):String(v); return /[",\n\r]/.test(s)?`"${s.replaceAll('"','""')}"`:s; }
function writeCsv(file, headers, rows){ fs.writeFileSync(path.join(outDir,file),[headers.join(','),...rows.map(r=>headers.map(h=>q(r[h])).join(','))].join('\n')+'\n'); }
function safeJson(file){ try { const text=fs.readFileSync(file,'utf8'); if(file.endsWith('.json.gz.b64')) return JSON.parse(zlib.gunzipSync(Buffer.from(text.trim(),'base64')).toString('utf8')); return JSON.parse(text); } catch(e){ return null; } }
function walk(dir){ if(!fs.existsSync(dir))return []; const out=[]; for(const ent of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,ent.name); if(ent.isDirectory())out.push(...walk(p)); else if(ent.isFile()&&(ent.name.endsWith('.json')||ent.name.endsWith('.json.gz.b64')))out.push(p); } return out.sort(); }
function stableString(obj){ if(obj===null||typeof obj!=='object')return JSON.stringify(obj); if(Array.isArray(obj))return '['+obj.map(stableString).join(',')+']'; return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+stableString(obj[k])).join(',')+'}'; }
function stateFingerprint(s){ return stableString({age:num(s.age),tier:s.tier??null,roles:[...(s.roles??[])].map(String).sort(),stats:Object.fromEntries(Object.entries(s.stats??{}).map(([k,v])=>[normStat(k),num(v)]).sort(([a],[b])=>a.localeCompare(b))) }); }
function empiricalFingerprint(e){ return stableString({state:stateFingerprint(e),coach:{programme:normText(e.programmeFamily),title:normText(e.coachTitle),multiplier:num(e.multiplier),transferClass:normText(e.transferClass),affected:[...(e.affectedStats??[])].map(normStat).sort()},intervals:[...(e.intervals??[])].map(x=>({stat:normStat(x.stat),lo:num(x.lo),hi:num(x.hi)})).sort((a,b)=>a.stat.localeCompare(b.stat)),ovr:e.ovr??null}); }
function playerKey(id,name){ const rawId=String(id??'').trim(); const i=normText(rawId); if(/^PLY-\d+$/i.test(rawId)) return i; const n=normText(name); return n || i || 'unknown-player'; }

const states=[];
const observations=[];
const sources=[];
let discardedNonPositiveStatValues=0;
function addState(raw, sourceFile, sourceKind){
  if(!raw)return null;
  const stats={}; for(const [k,v] of Object.entries(raw.stats??{})){ const n=num(v); if(n!==null&&n>0) stats[normStat(k)]=n; else if(n!==null) discardedNonPositiveStatValues++; }
  if(Object.keys(stats).length===0)return null;
  const s={
    playerKey:playerKey(raw.id,raw.name), playerId:raw.id??null, playerName:raw.name??null, stateId:raw._stateId??raw.stateId??null,
    age:num(raw.age), tier:raw.tier??null, roles:[...(raw.roles??raw.role??[])].map(String), overall:num(raw.overall??raw.ovr??raw.ovr_game), stats,
    observedAt:raw.observedAt??raw.last_updated??null, regime:raw._regime??raw.regime??null, sourceFile, sourceKind,
  };
  s.stateFingerprint=stateFingerprint(s);
  states.push(s); return s;
}
function addObservation({id,player,coach,observed,sourceFile,sourceKind,status='observed',classByStat={}}){
  if(!player||!coach||!observed)return;
  const st=addState(player,sourceFile,sourceKind);
  if(!st)return;
  const intervals=[];
  const map=observed.statIntervals??{};
  for(const [stat,r] of Object.entries(map)){
    const lo=num(r?.lo??r?.gainLo), hi=num(r?.hi??r?.gainHi);
    if(lo===null||hi===null)continue;
    intervals.push({stat:normStat(stat),lo,hi,displayClass:classByStat[normStat(stat)]??null});
  }
  if(intervals.length===0)return;
  const e={
    eventId:id??`${path.basename(sourceFile)}:${observations.length+1}`,
    playerKey:st.playerKey,playerId:st.playerId,playerName:st.playerName,age:st.age,tier:st.tier,roles:st.roles,overall:st.overall,stats:st.stats,stateFingerprint:st.stateFingerprint,
    programmeFamily:coach.programmeFamily??coach.programme??null,coachTitle:coach.title??coach.coachTitle??null,multiplier:num(coach.multiplier),transferClass:coach.transferClass??null,
    affectedStats:[...(coach.affectedStats??intervals.map(x=>x.stat))].map(normStat),intervals,
    ovr: observed.ovrDelta ? {lo:num(observed.ovrDelta.lo),hi:num(observed.ovrDelta.hi)} : observed.ovrBoost ? {lo:num(observed.ovrBoost.gainLo),hi:num(observed.ovrBoost.gainHi)} : null,
    stateChanged: observed.stateChanged===true, sourceFile,sourceKind,status,
  };
  e.empiricalFingerprint=empiricalFingerprint(e);
  observations.push(e);
}

// Parse every historical/versioned JSON source we can understand. Unknown files are retained in source inventory but ignored analytically.
for(const file of walk(corpusDir)){
  const doc=safeJson(file); if(!doc)continue;
  const rel=path.relative(corpusDir,file); sources.push({source_file:rel,kind:'corpus-json'});
  if(Array.isArray(doc.experiments)){
    for(const x of doc.experiments) addObservation({id:x.id,player:x.preOutcome?.player,coach:x.preOutcome?.coach,observed:x.observed,sourceFile:rel,sourceKind:'coach-experiments',classByStat:x._classByStat??{}});
  }
  if(doc.experimentId && doc.player && doc.coach && doc.observed?.statIntervals){
    addObservation({id:doc.experimentId,player:doc.player,coach:doc.coach,observed:doc.observed,sourceFile:rel,sourceKind:'observed-result',status:doc.validationClass??'observed'});
  }
  if(Array.isArray(doc.players)){
    for(const p of doc.players){
      for(const snap of p.snapshots??[]) addState({id:p.id,name:p.name,age:p.age,tier:snap.tier,roles:p.roles,overall:snap.ovr_game,stats:snap.stats,observedAt:null},rel,'calibration-snapshot');
      for(const o of p.observations??[]){
        const gains=(o.gains??[]).filter(g=>num(g.gainLo)!==null&&num(g.gainHi)!==null);
        if(!gains.length)continue;
        const stats={...(o.statsBefore??{})};
        const classByStat={}; for(const g of gains)classByStat[normStat(g.stat)]=g.isWhite===true?'WHITE':g.isWhite===false?'GREY':null;
        addObservation({id:`${p.id??p.name}:${o.screenshot??observations.length}`,player:{id:p.id,name:p.name,age:o.playerAge??p.age,tier:o.tier??null,roles:p.roles,overall:o.playerOvr,stats},coach:{programmeFamily:o.programmeFamily??'legacy-academy',title:`${o.coachType??''} ${o.coachCategory??''}`.trim(),multiplier:o.multiplier,transferClass:o.transferClass??'ordinary',affectedStats:gains.map(g=>g.stat)},observed:{statIntervals:Object.fromEntries(gains.map(g=>[g.stat,{lo:g.gainLo,hi:g.gainHi}])),ovrDelta:num(o.ovrBoostLo)!==null&&num(o.ovrBoostHi)!==null?{lo:o.ovrBoostLo,hi:o.ovrBoostHi}:null,stateChanged:false},sourceFile:rel,sourceKind:'legacy-calibration',classByStat});
      }
      if(p.stats && !p.snapshots && !p.observations) addState({id:p.id??p.name,name:p.name,age:p.age,tier:p.tier,roles:p.roles,overall:p.ovr??p.ovr_game,stats:p.stats,observedAt:p.last_updated},rel,'player-seed');
    }
  }
}

// Current immutable experiment log is a second corpus partition and is always consumed in full; no player filter exists.
const runFiles=walk(runsDir);
const runRecords=[];
for(const file of runFiles){
  const rec=safeJson(file); if(!rec||rec.schemaVersion!=='resource-coach-experiment-v1')continue;
  if(rec.experiment?.status!=='observed'||!rec.observation)continue;
  runRecords.push(rec);
  const input=rec.observation.input??rec.experiment.input??{};
  let roles=[], allStats={};
  try { const parsed=JSON.parse(input.stateKey??'null'); if(Array.isArray(parsed)){ roles=Array.isArray(parsed[2])?parsed[2]:[]; if(Array.isArray(parsed[3])) allStats=Object.fromEntries(parsed[3].map(([k,v])=>[normStat(k),v])); } } catch {}
  for(const s of input.stats??[]) if(num(s.displayedStat)!==null) allStats[normStat(s.stat)]=num(s.displayedStat);
  const classByStat=Object.fromEntries((input.stats??[]).map(s=>[normStat(s.stat),s.displayClass??null]));
  addObservation({
    id:rec.experiment.experimentId,
    player:{id:input.playerId??rec.experiment.playerId,name:input.playerName??null,age:input.age,tier:input.tier,roles,overall:null,stats:allStats},
    coach:{programmeFamily:input.programmeFamily,title:input.coachLabel,multiplier:input.multiplier,transferClass:input.transferClass,affectedStats:(input.stats??[]).map(s=>s.stat)},
    observed:{statIntervals:Object.fromEntries((rec.observation.intervals??[]).map(r=>[r.stat,{lo:r.gainLo,hi:r.gainHi}])),ovrDelta:rec.observation.ovrBoost?{lo:rec.observation.ovrBoost.gainLo,hi:rec.observation.ovrBoost.gainHi}:null,stateChanged:false},
    sourceFile:path.relative(runsDir,file),sourceKind:'resource-coach-experiment-v1',status:rec.evidence?.isDuplicate?'duplicate':'current-experiment',classByStat,
  });
}

// Deduplicate empirical previews without deleting provenance. First occurrence carries analytical weight.
const seenEvidence=new Map();
for(const e of observations){ const prior=seenEvidence.get(e.empiricalFingerprint); e.fitWeight=prior?0:1; e.duplicateOf=prior?.eventId??null; if(!prior)seenEvidence.set(e.empiricalFingerprint,e); }

// Collapse repeated representations of the same state before calculating deltas.
// Re-observations are preserved separately, so repeated screenshots do not multiply
// the number of longitudinal comparisons.
const uniqueStateMap=new Map();
for(const s of states){
  const key=`${s.playerKey}::${s.stateFingerprint}`;
  const g=uniqueStateMap.get(key);
  if(g){ g.observationCount++; g.sources.add(s.sourceFile); }
  else uniqueStateMap.set(key,{state:s,observationCount:1,sources:new Set([s.sourceFile])});
}
const uniqueStates=[...uniqueStateMap.values()].map(x=>x.state);
const stateReobservations=[...uniqueStateMap.values()].filter(x=>x.observationCount>1).map(x=>({
  player_key:x.state.playerKey,player_name:x.state.playerName??'',state_fingerprint:x.state.stateFingerprint,
  observation_count:x.observationCount,sources:[...x.sources].sort().join(' | ')
}));

// Same-player longitudinal comparisons use unique observed states. These are
// OBSERVED STATE COMPARISONS unless a direct causal transition is explicitly evidenced.
const byPlayer=new Map(); for(const s of uniqueStates){ if(!byPlayer.has(s.playerKey))byPlayer.set(s.playerKey,[]); byPlayer.get(s.playerKey).push(s); }
const stateComparisons=[];
for(const [pk,ss] of byPlayer){
  for(let i=0;i<ss.length;i++) for(let j=i+1;j<ss.length;j++){
    const a=ss[i],b=ss[j]; const keys=[...new Set([...Object.keys(a.stats),...Object.keys(b.stats)])].sort(); const deltas=[];
    for(const stat of keys){ if(finite(a.stats[stat])&&finite(b.stats[stat]))deltas.push({stat,delta:b.stats[stat]-a.stats[stat]}); }
    const changed=deltas.filter(x=>x.delta!==0);
    stateComparisons.push({player_key:pk,player_name:b.playerName??a.playerName??'',state_a:a.stateFingerprint,state_b:b.stateFingerprint,source_a:a.sourceFile,source_b:b.sourceFile,age_a:a.age,age_b:b.age,tier_a:a.tier,tier_b:b.tier,ovr_a:a.overall,ovr_b:b.overall,comparison_class:'OBSERVED_STATE_DELTA_NOT_CAUSAL',shared_stat_count:deltas.length,changed_stat_count:changed.length,total_abs_stat_delta:changed.reduce((z,x)=>z+Math.abs(x.delta),0),max_abs_stat_delta:changed.length?Math.max(...changed.map(x=>Math.abs(x.delta))):0,changed_stats:changed.map(x=>`${x.stat}:${x.delta>=0?'+':''}${x.delta}`).join(' | ')});
  }
}

const empiricalStats=[];
for(const e of observations){
  for(const r of e.intervals){ empiricalStats.push({event:e,stat:r.stat,start:num(e.stats?.[r.stat]),displayClass:r.displayClass??null,lo:r.lo,hi:r.hi}); }
}

function statSchema(stats){
  const keys=new Set(Object.keys(stats??{})); return keys.has('REFLEXES')||keys.has('AERIAL REACH')?'GK':'OUTFIELD';
}
function roleDistance(a,b){
  const A=new Set((a??[]).map(normText).filter(Boolean)), B=new Set((b??[]).map(normText).filter(Boolean));
  const union=new Set([...A,...B]); if(!union.size)return 0;
  let inter=0; for(const x of A)if(B.has(x))inter++; return 1-inter/union.size;
}
function tierNumber(t){ const m=/^T([0-6])$/i.exec(String(t??'').trim()); return m?Number(m[1]):null; }
function stateMatchMetrics(target,cand){
  if(statSchema(target.stats)!==statSchema(cand.stats))return null;
  const shared=Object.keys(target.stats??{}).filter(k=>finite(target.stats[k])&&finite(cand.stats?.[k]));
  if(!shared.length)return null;
  const diffs=shared.map(k=>Math.abs(target.stats[k]-cand.stats[k]));
  const exactStatCount=diffs.filter(d=>d===0).length;
  const statMae=diffs.reduce((a,b)=>a+b,0)/diffs.length;
  const maxAbsStatDiff=Math.max(...diffs);
  const aTier=tierNumber(target.tier), bTier=tierNumber(cand.tier);
  const tierDiff=aTier!==null&&bTier!==null?Math.abs(aTier-bTier):null;
  const tierMismatch=tierDiff===null?1:(tierDiff===0?0:1);
  const ageDiff=finite(target.age)&&finite(cand.age)?Math.abs(target.age-cand.age):999;
  const rolesDistance=roleDistance(target.roles,cand.roles);
  const structuralExact=tierMismatch===0&&ageDiff===0&&rolesDistance===0;
  const fullStatExact=shared.length===Object.keys(target.stats??{}).length&&shared.length===Object.keys(cand.stats??{}).length&&exactStatCount===shared.length;
  const matchClass=structuralExact&&fullStatExact?'EXACT_STATE_REOBSERVATION':structuralExact?'STRUCTURAL_MATCH_NEAREST_VECTOR_NOT_IDENTITY':'STATE_ANALOGUE_NOT_IDENTITY';
  return {sharedStatCount:shared.length,exactStatCount,statMae,maxAbsStatDiff,tierDiff,tierMismatch,ageDiff,rolesDistance,structuralExact,fullStatExact,matchClass};
}
function stateMatchSort(a,b){
  return a.metrics.tierMismatch-b.metrics.tierMismatch
    || a.metrics.ageDiff-b.metrics.ageDiff
    || a.metrics.rolesDistance-b.metrics.rolesDistance
    || a.metrics.statMae-b.metrics.statMae
    || a.metrics.maxAbsStatDiff-b.metrics.maxAbsStatDiff
    || String(a.state.stateId??a.state.stateFingerprint).localeCompare(String(b.state.stateId??b.state.stateFingerprint));
}

const canonicalStates=uniqueStates.filter(s=>s.sourceKind!=='resource-coach-experiment-v1');
const experimentStateMatches=[];
const bestStateByExperiment=new Map();
for(const rec of runRecords){
  const id=rec.experiment.experimentId;
  const e=observations.find(x=>x.eventId===id&&x.sourceKind==='resource-coach-experiment-v1'); if(!e)continue;
  const ranked=canonicalStates.map(state=>({state,metrics:stateMatchMetrics(e,state)})).filter(x=>x.metrics).sort(stateMatchSort).slice(0,topN);
  if(ranked[0])bestStateByExperiment.set(id,ranked[0]);
  for(let rank=0;rank<ranked.length;rank++){
    const x=ranked[rank];
    experimentStateMatches.push({
      experiment_id:id,rank:rank+1,target_age:e.age,target_tier:e.tier??'',target_roles:(e.roles??[]).join('/'),target_stat_count:Object.keys(e.stats??{}).length,
      corpus_player_id:x.state.playerId??'',corpus_player_name:x.state.playerName??'',corpus_state_id:x.state.stateId??'',corpus_regime:x.state.regime??'',corpus_age:x.state.age,corpus_tier:x.state.tier??'',corpus_roles:(x.state.roles??[]).join('/'),
      shared_stat_count:x.metrics.sharedStatCount,exact_stat_count:x.metrics.exactStatCount,stat_mae:Number(x.metrics.statMae.toFixed(6)),max_abs_stat_diff:x.metrics.maxAbsStatDiff,
      age_diff:x.metrics.ageDiff,tier_diff:x.metrics.tierDiff,role_jaccard_distance:Number(x.metrics.rolesDistance.toFixed(6)),match_class:x.metrics.matchClass
    });
  }
}

function similarity(target, cand){
  let score=0; const reasons=[]; const te=target.event, ce=cand.event;
  if(target.stat===cand.stat){score+=30;reasons.push('same-stat');} else return {score:-Infinity,reasons:[]};
  const tprog=normText(te.programmeFamily), cprog=normText(ce.programmeFamily); if(tprog&&cprog&&tprog===cprog){score+=20;reasons.push('same-programme');}
  const tt=normText(te.coachTitle), ct=normText(ce.coachTitle); if(tt&&ct&&tt===ct){score+=20;reasons.push('same-coach-title');}
  if(finite(te.multiplier)&&finite(ce.multiplier)){ const d=Math.abs(Math.log((te.multiplier+1e-9)/(ce.multiplier+1e-9))); score+=Math.max(0,15-10*d); if(te.multiplier===ce.multiplier)reasons.push('same-multiplier'); }
  if(target.displayClass&&cand.displayClass&&target.displayClass===cand.displayClass){score+=8;reasons.push('same-class');}
  if(finite(te.age)&&finite(ce.age)){ const d=Math.abs(te.age-ce.age); score+=Math.max(0,10-d*2); if(d===0)reasons.push('same-age'); }
  if(te.tier&&ce.tier&&te.tier===ce.tier){score+=5;reasons.push('same-tier');}
  if(finite(target.start)&&finite(cand.start)){ const d=Math.abs(target.start-cand.start); score+=Math.max(0,20-d/5); if(d<=5)reasons.push('near-start-stat'); }
  const tp=te.affectedStats?.length??0, cp=ce.affectedStats?.length??0; if(tp&&cp){score+=Math.max(0,5-Math.abs(tp-cp)); if(tp===cp)reasons.push('same-target-count');}
  if(te.playerKey===ce.playerKey){score+=6;reasons.push('same-player');}
  return {score,reasons};
}

const matches=[];
const intakeRows=[];
for(const rec of runRecords){
  const id=rec.experiment.experimentId; const e=observations.find(x=>x.eventId===id&&x.sourceKind==='resource-coach-experiment-v1'); if(!e)continue;
  for(const r of e.intervals){
    const target=empiricalStats.find(x=>x.event===e&&x.stat===r.stat&&x.lo===r.lo&&x.hi===r.hi); if(!target)continue;
    const ranked=empiricalStats.filter(x=>x.event!==e&&x.event.fitWeight===1&&x.event.empiricalFingerprint!==e.empiricalFingerprint).map(x=>({x,...similarity(target,x)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score).slice(0,topN);
    for(let rank=0;rank<ranked.length;rank++){
      const m=ranked[rank]; matches.push({experiment_id:id,target_stat:r.stat,target_start_stat:target.start,target_gain_lo:r.lo,target_gain_hi:r.hi,rank:rank+1,similarity_score:Number(m.score.toFixed(4)),match_reasons:m.reasons.join('|'),reference_event_id:m.x.event.eventId,reference_player:m.x.event.playerName??m.x.event.playerId??'',reference_age:m.x.event.age,reference_tier:m.x.event.tier,reference_programme:m.x.event.programmeFamily,reference_coach:m.x.event.coachTitle,reference_multiplier:m.x.event.multiplier,reference_start_stat:m.x.start,reference_class:m.x.displayClass,reference_gain_lo:m.x.lo,reference_gain_hi:m.x.hi,reference_source:m.x.event.sourceFile});
    }
    const sameStat=empiricalStats.filter(x=>x.event!==e&&x.event.fitWeight===1&&x.event.empiricalFingerprint!==e.empiricalFingerprint&&x.stat===r.stat);
    const exactCoach=sameStat.filter(x=>normText(x.event.coachTitle)===normText(e.coachTitle)&&num(x.event.multiplier)===num(e.multiplier)&&normText(x.event.programmeFamily)===normText(e.programmeFamily));
    const cohort=exactCoach.length?exactCoach:sameStat;
    const bestState=bestStateByExperiment.get(id);
    intakeRows.push({experiment_id:id,evidence_fingerprint:rec.evidence?.fingerprint??'',is_duplicate:!!rec.evidence?.isDuplicate,fit_weight:rec.evidence?.isDuplicate?0:1,player_id:e.playerId??'',age:e.age,tier:e.tier??'',programme_family:e.programmeFamily??'',coach_title:e.coachTitle??'',multiplier:e.multiplier,stat:r.stat,start_stat:target.start,display_class:target.displayClass??'',observed_lo:r.lo,observed_hi:r.hi,nearest_corpus_player_id:bestState?.state.playerId??'',nearest_corpus_player_name:bestState?.state.playerName??'',nearest_corpus_state_id:bestState?.state.stateId??'',nearest_state_stat_mae:bestState?Number(bestState.metrics.statMae.toFixed(6)):null,nearest_state_match_class:bestState?.metrics.matchClass??'',comparison_scope:exactCoach.length?'exact-coach-programme-multiplier':'same-stat-global',comparison_n:cohort.length,corpus_lo_min:cohort.length?Math.min(...cohort.map(x=>x.lo)):null,corpus_lo_max:cohort.length?Math.max(...cohort.map(x=>x.lo)):null,corpus_hi_min:cohort.length?Math.min(...cohort.map(x=>x.hi)):null,corpus_hi_max:cohort.length?Math.max(...cohort.map(x=>x.hi)):null,best_match_score:ranked[0]?Number(ranked[0].score.toFixed(4)):null,best_match_event:ranked[0]?.x.event.eventId??''});
  }
}

// Corpus-wide endpoint metrics by explicit covariates. Low/high are kept separate; no midpoint substitution.
const groups=new Map();
for(const x of empiricalStats.filter(x=>x.event.fitWeight===1)){
  const key=stableString({stat:x.stat,programme:normText(x.event.programmeFamily)||'unknown',coach:normText(x.event.coachTitle)||'unknown',multiplier:num(x.event.multiplier),age_band:ageBand(x.event.age),tier:x.event.tier??'unknown',display_class:x.displayClass??'unknown'});
  if(!groups.has(key))groups.set(key,{stat:x.stat,programme_family:x.event.programmeFamily??'unknown',coach_title:x.event.coachTitle??'unknown',multiplier:x.event.multiplier,age_band:ageBand(x.event.age),tier:x.event.tier??'unknown',display_class:x.displayClass??'unknown',lo:[],hi:[],players:new Set(),events:new Set()});
  const g=groups.get(key); g.lo.push(x.lo);g.hi.push(x.hi);g.players.add(x.event.playerKey);g.events.add(x.event.eventId);
}
const metrics=[...groups.values()].map(g=>({stat:g.stat,programme_family:g.programme_family,coach_title:g.coach_title,multiplier:g.multiplier,age_band:g.age_band,tier:g.tier,display_class:g.display_class,event_count:g.events.size,player_count:g.players.size,mean_lo:g.lo.reduce((a,b)=>a+b,0)/g.lo.length,mean_hi:g.hi.reduce((a,b)=>a+b,0)/g.hi.length,min_lo:Math.min(...g.lo),max_lo:Math.max(...g.lo),min_hi:Math.min(...g.hi),max_hi:Math.max(...g.hi)})).sort((a,b)=>b.event_count-a.event_count||a.stat.localeCompare(b.stat));

fs.mkdirSync(outDir,{recursive:true});
writeCsv('state_reobservations.csv',['player_key','player_name','state_fingerprint','observation_count','sources'],stateReobservations);
writeCsv('state_comparisons.csv',['player_key','player_name','state_a','state_b','source_a','source_b','age_a','age_b','tier_a','tier_b','ovr_a','ovr_b','comparison_class','shared_stat_count','changed_stat_count','total_abs_stat_delta','max_abs_stat_delta','changed_stats'],stateComparisons);
writeCsv('experiment_matches.csv',['experiment_id','target_stat','target_start_stat','target_gain_lo','target_gain_hi','rank','similarity_score','match_reasons','reference_event_id','reference_player','reference_age','reference_tier','reference_programme','reference_coach','reference_multiplier','reference_start_stat','reference_class','reference_gain_lo','reference_gain_hi','reference_source'],matches);
writeCsv('experiment_state_matches.csv',['experiment_id','rank','target_age','target_tier','target_roles','target_stat_count','corpus_player_id','corpus_player_name','corpus_state_id','corpus_regime','corpus_age','corpus_tier','corpus_roles','shared_stat_count','exact_stat_count','stat_mae','max_abs_stat_diff','age_diff','tier_diff','role_jaccard_distance','match_class'],experimentStateMatches);
writeCsv('cohort_metrics.csv',['stat','programme_family','coach_title','multiplier','age_band','tier','display_class','event_count','player_count','mean_lo','mean_hi','min_lo','max_lo','min_hi','max_hi'],metrics);
writeCsv('form_intake.csv',['experiment_id','evidence_fingerprint','is_duplicate','fit_weight','player_id','age','tier','programme_family','coach_title','multiplier','stat','start_stat','display_class','observed_lo','observed_hi','nearest_corpus_player_id','nearest_corpus_player_name','nearest_corpus_state_id','nearest_state_stat_mae','nearest_state_match_class','comparison_scope','comparison_n','corpus_lo_min','corpus_lo_max','corpus_hi_min','corpus_hi_max','best_match_score','best_match_event'],intakeRows);

const summary={
  schemaVersion:'resource-coach-longitudinal-analysis-v1',
  corpusDirectory:path.relative(process.cwd(),corpusDir),runsDirectory:path.relative(process.cwd(),runsDir),sourceJsonFiles:sources.length,
  rawStateRecords:states.length,uniqueStateFingerprints:uniqueStates.length,stateReobservedFingerprints:stateReobservations.length,playerIdentities:byPlayer.size,stateComparisons:stateComparisons.length,
  empiricalPreviewRecords:observations.length,uniqueEmpiricalPreviews:seenEvidence.size,duplicateEmpiricalPreviews:observations.length-seenEvidence.size,empiricalStatIntervals:empiricalStats.length,
  currentExperimentRecords:runRecords.length,currentIntakeRows:intakeRows.length,matchRows:matches.length,experimentStateMatchRows:experimentStateMatches.length,cohortMetricRows:metrics.length,discardedNonPositiveStatValues,
  safeguards:[
    'No player filter: every run is evaluated against the full available corpus in one batch.',
    'Same-player state pairs are labelled observed comparisons unless a direct causal transition is explicitly evidenced.',
    'Interval endpoints remain separate; no midpoint is substituted for observed low/high bounds.',
    'Exact empirical duplicates are retained for provenance but receive zero analytical weight.',
    'Similarity is descriptive retrieval only; it is not a fitted transfer law or causal score.',
    'Non-positive player stat values are treated as missing/sentinel evidence and excluded from state fingerprints and deltas.',
    'Nearest canonical state matches are labelled analogues unless the complete state is an exact re-observation; similarity never asserts player identity.'
  ]
};
fs.writeFileSync(path.join(outDir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
