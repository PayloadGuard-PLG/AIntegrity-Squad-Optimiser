import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const corpusPath = path.resolve(process.argv[2] ?? 'calibration/longitudinal-corpus/corpus-v1.json.gz.b64');
const runsDir = path.resolve(process.argv[3] ?? 'calibration/resource-coach-log/runs');
const outDir = path.resolve(process.argv[4] ?? 'calibration/resource-coach-log/longitudinal-generated');
const TOP_STATE_NEIGHBOURS = Number(process.env.LONGITUDINAL_STATE_NEIGHBOURS ?? 8);
const TOP_RESPONSE_ANALOGUES = Number(process.env.LONGITUDINAL_RESPONSE_ANALOGUES ?? 6);

function die(message) { console.error(message); process.exit(1); }
function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
function upper(v) { return String(v ?? '').trim().toUpperCase(); }
function tierIndex(v) {
  const m = /^T([0-6])$/i.exec(String(v ?? '').trim());
  return m ? Number(m[1]) : null;
}
function splitRoles(v) {
  if (Array.isArray(v)) return v.map(upper).filter(Boolean).sort();
  return String(v ?? '').split('/').map(upper).filter(Boolean).sort();
}
function jaccardDistance(a, b) {
  const A = new Set(a), B = new Set(b), union = new Set([...A, ...B]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const x of A) if (B.has(x)) intersection++;
  return 1 - intersection / union.size;
}
function mean(xs) { return xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : null; }
function median(xs) {
  if (!xs.length) return null;
  const a = [...xs].sort((x,y)=>x-y), i = Math.floor(a.length/2);
  return a.length % 2 ? a[i] : (a[i-1] + a[i]) / 2;
}
function q(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}
function csv(headers, rows) {
  return [headers.map(q).join(','), ...rows.map(r=>headers.map(h=>q(r[h])).join(','))].join('\n') + '\n';
}
function writeCsv(name, headers, rows) { fs.writeFileSync(path.join(outDir,name), csv(headers, rows)); }
function safeParseJson(text) { try { return JSON.parse(text); } catch { return null; } }
function statSchemaFromStats(stats) {
  const keys = new Set(Object.keys(stats ?? {}).map(upper));
  return keys.has('REFLEXES') || keys.has('AERIAL REACH') ? 'GK' : 'OUTFIELD';
}
function parseStateKey(stateKey) {
  if (!stateKey) return null;
  const parsed = safeParseJson(stateKey);
  if (!Array.isArray(parsed) || parsed.length < 4) return null;
  const [age,tier,roles,entries] = parsed;
  const stats = {};
  if (Array.isArray(entries)) for (const pair of entries) {
    if (Array.isArray(pair) && pair.length >= 2 && finite(pair[1])) stats[upper(pair[0])] = pair[1];
  }
  return { age, tier, roles: splitRoles(roles), stats, statSchema: statSchemaFromStats(stats) };
}

function assertUnique(rows,key,label) {
  const seen=new Set();
  for (const r of rows) {
    const v=r[key];
    if (!v) die(`${label}: missing ${key}`);
    if (seen.has(v)) die(`${label}: duplicate ${key} ${v}`);
    seen.add(v);
  }
}
function validateCorpus(root, corpus) {
  for (const [key,count] of Object.entries(root.counts??{})) {
    if (Array.isArray(corpus[key]) && corpus[key].length!==count) die(`Corpus count mismatch for ${key}: manifest=${count} actual=${corpus[key].length}`);
  }
  assertUnique(corpus.players,'player_id','players');
  assertUnique(corpus.playerStates,'player_state_id','playerStates');
  assertUnique(corpus.coachDefinitions,'coach_id','coachDefinitions');
  assertUnique(corpus.coachInstances,'coach_instance_id','coachInstances');
  assertUnique(corpus.coachPreviews,'preview_id','coachPreviews');
  const playerIds=new Set(corpus.players.map(r=>r.player_id));
  const stateIds=new Set(corpus.playerStates.map(r=>r.player_state_id));
  const instanceIds=new Set(corpus.coachInstances.map(r=>r.coach_instance_id));
  const previewIds=new Set(corpus.coachPreviews.map(r=>r.preview_id));
  for (const s of corpus.playerStates) if(!playerIds.has(s.player_id)) die(`playerStates: unknown player_id ${s.player_id}`);
  for (const r of corpus.playerStateStats) if(!stateIds.has(r.player_state_id)) die(`playerStateStats: unknown player_state_id ${r.player_state_id}`);
  for (const p of corpus.coachPreviews) {
    if(!stateIds.has(p.player_state_id)) die(`coachPreviews: unknown player_state_id ${p.player_state_id}`);
    if(!instanceIds.has(p.coach_instance_id)) die(`coachPreviews: unknown coach_instance_id ${p.coach_instance_id}`);
  }
  for (const r of corpus.coachPreviewStats) {
    if(!previewIds.has(r.preview_id)) die(`coachPreviewStats: unknown preview_id ${r.preview_id}`);
    if(!stateIds.has(r.player_state_id)) die(`coachPreviewStats: unknown player_state_id ${r.player_state_id}`);
  }
  for (const s of corpus.playerStates.filter(r=>r.state_complete)) {
    const n=corpus.playerStateStats.filter(r=>r.player_state_id===s.player_state_id && r.observed).length;
    if(n!==15) die(`Complete state ${s.player_state_id} has ${n} observed stats, expected 15.`);
  }
}

function stateStatsMap(rows) {
  const out = new Map();
  for (const r of rows) {
    const id = r.player_state_id;
    if (!id) continue;
    if (!out.has(id)) out.set(id, new Map());
    out.get(id).set(upper(r.stat_name), { value:r.stat_value, displayClass:upper(r.display_class), observed:!!r.observed });
  }
  return out;
}
function toPlainStats(map) {
  const obj = {};
  for (const [k,v] of map ?? []) if (finite(v.value)) obj[k] = v.value;
  return obj;
}
function classMap(map) {
  const obj = {};
  for (const [k,v] of map ?? []) obj[k] = v.displayClass;
  return obj;
}
function stateFeature(state, statsMap) {
  return {
    stateId: state.player_state_id,
    playerId: state.player_id,
    playerName: state.player_name,
    age: state.age,
    tier: state.tier_internal,
    tierIndex: tierIndex(state.tier_internal),
    ovr: state.ovr,
    roles: splitRoles(state.established_roles),
    stats: toPlainStats(statsMap.get(state.player_state_id)),
    classes: classMap(statsMap.get(state.player_state_id)),
    statSchema: String(state.stat_schema ?? '').startsWith('GK:') ? 'GK' : 'OUTFIELD',
    stateComplete: !!state.state_complete,
    regime: state.experimental_regime,
    sequenceNo: state.sequence_no,
    observedAt: state.observed_at,
    previousStateId: state.previous_player_state_id,
    previousLinkType: state.previous_link_type,
  };
}
function compareStateFeatures(a,b) {
  const common = Object.keys(a.stats).filter(k=>finite(a.stats[k]) && finite(b.stats[k]));
  const statAbs = common.map(k=>Math.abs(a.stats[k]-b.stats[k]));
  const statMad = mean(statAbs);
  const classMismatch = common.length ? common.filter(k=>a.classes[k] && b.classes[k] && a.classes[k] !== b.classes[k]).length/common.length : null;
  const ageDiff = finite(a.age)&&finite(b.age) ? Math.abs(a.age-b.age) : null;
  const tiA = a.tierIndex, tiB = b.tierIndex;
  const tierDiff = tiA!==null&&tiB!==null ? Math.abs(tiA-tiB) : null;
  const ovrDiff = finite(a.ovr)&&finite(b.ovr) ? Math.abs(a.ovr-b.ovr) : null;
  const roleDistance = jaccardDistance(a.roles,b.roles);
  const schemaPenalty = a.statSchema === b.statSchema ? 0 : 10;
  // Deterministic descriptive similarity heuristic. It is not a fitted game model.
  const distance = schemaPenalty
    + (statMad ?? 100) / 25
    + (ageDiff ?? 10) / 5
    + (tierDiff ?? 4) / 2
    + (ovrDiff ?? 100) / 25
    + roleDistance
    + (classMismatch ?? 1);
  return { distance, commonStatCount:common.length, statMad, classMismatch, ageDiff, tierDiff, ovrDiff, roleDistance };
}
function pairRelation(a,b,directTransitionSet) {
  const keyAB = `${a.stateId}->${b.stateId}`;
  const keyBA = `${b.stateId}->${a.stateId}`;
  if (directTransitionSet.has(keyAB)) return {relation:'verified-direct-transition',from:a,to:b,isCausal:true};
  if (directTransitionSet.has(keyBA)) return {relation:'verified-direct-transition',from:b,to:a,isCausal:true};
  if (b.previousStateId === a.stateId) {
    const t = upper(b.previousLinkType);
    if (t.includes('EXACT_REOBSERVATION')) return {relation:'exact-reobservation',from:a,to:b,isCausal:false};
    if (t.includes('NOT_ASSERTED_DIRECT_TRANSITION')) return {relation:'linked-longitudinal-observations',from:a,to:b,isCausal:false};
    return {relation:'linked-state-pair',from:a,to:b,isCausal:false};
  }
  if (a.previousStateId === b.stateId) {
    const t = upper(a.previousLinkType);
    if (t.includes('EXACT_REOBSERVATION')) return {relation:'exact-reobservation',from:b,to:a,isCausal:false};
    if (t.includes('NOT_ASSERTED_DIRECT_TRANSITION')) return {relation:'linked-longitudinal-observations',from:b,to:a,isCausal:false};
    return {relation:'linked-state-pair',from:b,to:a,isCausal:false};
  }
  const seqA = finite(a.sequenceNo) ? a.sequenceNo : null, seqB = finite(b.sequenceNo) ? b.sequenceNo : null;
  if (seqA !== null && seqB !== null && seqA !== seqB) return seqA < seqB
    ? {relation:'same-player-sequence-comparison',from:a,to:b,isCausal:false}
    : {relation:'same-player-sequence-comparison',from:b,to:a,isCausal:false};
  return {relation:'unordered-same-player-comparison',from:a,to:b,isCausal:false};
}
function deltaSummary(from,to) {
  const common = Object.keys(from.stats).filter(k=>finite(from.stats[k]) && finite(to.stats[k]));
  const deltas = Object.fromEntries(common.map(k=>[k,to.stats[k]-from.stats[k]]));
  const changed = Object.entries(deltas).filter(([,v])=>v!==0);
  const abs = changed.map(([,v])=>Math.abs(v));
  return {
    commonStatCount:common.length,
    changedStatCount:changed.length,
    statDeltaSum:Object.values(deltas).reduce((a,b)=>a+b,0),
    statAbsDeltaSum:abs.reduce((a,b)=>a+b,0),
    maxAbsStatDelta:abs.length?Math.max(...abs):0,
    deltas,
  };
}
function responseRows(corpus, stateFeatures, statsByState) {
  const previews = new Map(corpus.coachPreviews.map(r=>[r.preview_id,r]));
  const instances = new Map(corpus.coachInstances.map(r=>[r.coach_instance_id,r]));
  const defs = new Map(corpus.coachDefinitions.map(r=>[r.coach_id,r]));
  const affectedCounts = new Map();
  for (const r of corpus.coachAffectedStats) if (r.affected) affectedCounts.set(r.coach_instance_id,(affectedCounts.get(r.coach_instance_id)??0)+1);
  const featuresByState = new Map(stateFeatures.map(s=>[s.stateId,s]));
  const rows=[];
  for (const r of corpus.coachPreviewStats) {
    if (!r.gain_observed || !finite(r.gain_lo) || !finite(r.gain_hi)) continue;
    const p=previews.get(r.preview_id)??{}, inst=instances.get(r.coach_instance_id)??{}, def=defs.get(inst.coach_id??p.coach_id)??{};
    const state=featuresByState.get(r.player_state_id);
    if (!state) continue;
    const stateStat=statsByState.get(r.player_state_id)?.get(upper(r.stat_name));
    rows.push({
      responseId:`${r.preview_id}:${upper(r.stat_name)}`,
      previewId:r.preview_id,
      playerId:state.playerId,playerName:state.playerName,playerStateId:state.stateId,
      age:state.age,tier:state.tier,ovr:state.ovr,roles:state.roles.join('/'),statSchema:state.statSchema,
      stat:upper(r.stat_name),currentValue:r.current_value,displayClass:upper(r.display_class||stateStat?.displayClass),
      gainLo:r.gain_lo,gainHi:r.gain_hi,coachId:inst.coach_id??p.coach_id??'',coachInstanceId:r.coach_instance_id,
      coachTitle:inst.coach_title_observed??def.coach_title??'',coachClass:inst.coach_class_observed??def.coach_class??'',
      multiplier:finite(inst.multiplier_observed)?inst.multiplier_observed:def.multiplier,
      transferClass:def.transfer_class??'',rewardStatus:def.reward_status??inst.reward_status_observed??'',
      affectedStatCount:affectedCounts.get(r.coach_instance_id)??null,
      sourceId:r.source_id??p.source_id??'',sourceScreenshot:r.source_screenshot??p.source_screenshot??'',
    });
  }
  const canonicalByKey=new Map();
  for (const r of rows) {
    const key=JSON.stringify([r.playerStateId,r.stat,r.currentValue,r.displayClass,r.gainLo,r.gainHi,upper(r.coachTitle),r.multiplier,r.transferClass]);
    if (canonicalByKey.has(key)) {
      r.isDuplicateEvidence=true;
      r.duplicateOfResponseId=canonicalByKey.get(key);
      r.fitWeight=0;
    } else {
      canonicalByKey.set(key,r.responseId);
      r.isDuplicateEvidence=false;
      r.duplicateOfResponseId='';
      r.fitWeight=1;
    }
  }
  return rows;
}
function responseDistance(a,b,stateFeaturesById) {
  if (a.stat !== b.stat) return null;
  if (a.transferClass && b.transferClass && a.transferClass !== b.transferClass) return null;
  const sa=stateFeaturesById.get(a.playerStateId), sb=stateFeaturesById.get(b.playerStateId);
  if (!sa || !sb || sa.statSchema !== sb.statSchema) return null;
  const sd=compareStateFeatures(sa,sb);
  const multiplierDiff=finite(a.multiplier)&&finite(b.multiplier)?Math.abs(a.multiplier-b.multiplier):null;
  const affectedDiff=finite(a.affectedStatCount)&&finite(b.affectedStatCount)?Math.abs(a.affectedStatCount-b.affectedStatCount):null;
  const classMismatch=a.displayClass&&b.displayClass&&a.displayClass!==b.displayClass?1:0;
  const titleMismatch=upper(a.coachTitle)===upper(b.coachTitle)?0:0.5;
  const distance=sd.distance+(multiplierDiff??50)/20+(affectedDiff??5)/3+classMismatch+titleMismatch;
  return {distance,multiplierDiff,affectedDiff,classMismatch,titleMismatch,stateDistance:sd.distance,currentStatDiff:finite(a.currentValue)&&finite(b.currentValue)?Math.abs(a.currentValue-b.currentValue):null};
}
function experimentStateFeature(rec) {
  const input=rec.experiment?.input??rec.observation?.input??{};
  const parsed=parseStateKey(input.stateKey);
  if (!parsed) return null;
  return {
    stateId:`RUN:${rec.experiment?.experimentId??rec.observation?.id??'unknown'}`,
    playerId:input.playerId??rec.experiment?.playerId??'',playerName:'',age:parsed.age,tier:parsed.tier,tierIndex:tierIndex(parsed.tier),
    ovr:null,roles:parsed.roles,stats:parsed.stats,classes:Object.fromEntries((input.stats??[]).map(s=>[upper(s.stat),upper(s.displayClass)])),statSchema:parsed.statSchema,
    stateComplete:Object.keys(parsed.stats).length>=15,regime:rec.experiment?.originPartition??rec.experiment?.partition??'',sequenceNo:null,observedAt:rec.experiment?.observedAt??null,previousStateId:null,previousLinkType:null,
  };
}
function loadRuns(dir) {
  if (!fs.existsSync(dir)) return [];
  const out=[];
  for (const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort()) {
    const full=path.join(dir,file); const rec=JSON.parse(fs.readFileSync(full,'utf8'));
    if (rec.schemaVersion !== 'resource-coach-experiment-v1') continue;
    out.push({file,rec});
  }
  return out;
}

if (!fs.existsSync(corpusPath)) die(`Corpus snapshot not found: ${corpusPath}`);
let corpusBytes=fs.readFileSync(corpusPath);
if(corpusPath.endsWith('.b64')) corpusBytes=Buffer.from(corpusBytes.toString('utf8').trim(),'base64');
const corpusText=corpusPath.includes('.json.gz')?zlib.gunzipSync(corpusBytes).toString('utf8'):corpusBytes.toString('utf8');
const root=JSON.parse(corpusText);
if (root.schemaVersion !== 'squad-optimiser-longitudinal-corpus-v1') die(`Unsupported corpus schema: ${root.schemaVersion}`);
const corpus=root.data??{};
for (const key of ['players','playerStates','playerStateStats','coachDefinitions','coachInstances','coachAffectedStats','coachPreviews','coachPreviewStats','stateTransitions']) {
  if (!Array.isArray(corpus[key])) die(`Corpus missing array: data.${key}`);
}
validateCorpus(root,corpus);
fs.mkdirSync(outDir,{recursive:true});

const statsByState=stateStatsMap(corpus.playerStateStats);
const stateFeatures=corpus.playerStates.map(s=>stateFeature(s,statsByState));
const stateFeaturesById=new Map(stateFeatures.map(s=>[s.stateId,s]));
const statesByPlayer=new Map();
for (const s of stateFeatures) { if(!statesByPlayer.has(s.playerId)) statesByPlayer.set(s.playerId,[]); statesByPlayer.get(s.playerId).push(s); }
for (const arr of statesByPlayer.values()) arr.sort((a,b)=>(a.sequenceNo??1e9)-(b.sequenceNo??1e9)||String(a.stateId).localeCompare(String(b.stateId)));

const directTransitionSet=new Set((corpus.stateTransitions??[]).map(t=>`${t.from_state_id}->${t.to_state_id}`));
const statePairRows=[];
for (const [playerId,arr] of statesByPlayer) for(let i=0;i<arr.length;i++) for(let j=i+1;j<arr.length;j++) {
  const rel=pairRelation(arr[i],arr[j],directTransitionSet), d=deltaSummary(rel.from,rel.to);
  statePairRows.push({
    player_id:playerId,player_name:rel.from.playerName,from_state_id:rel.from.stateId,to_state_id:rel.to.stateId,
    relation:rel.relation,is_causal_transition:rel.isCausal,from_regime:rel.from.regime,to_regime:rel.to.regime,
    from_sequence:rel.from.sequenceNo,to_sequence:rel.to.sequenceNo,from_observed_at:rel.from.observedAt,to_observed_at:rel.to.observedAt,
    age_delta:finite(rel.from.age)&&finite(rel.to.age)?rel.to.age-rel.from.age:null,
    tier_delta:rel.from.tierIndex!==null&&rel.to.tierIndex!==null?rel.to.tierIndex-rel.from.tierIndex:null,
    ovr_delta:finite(rel.from.ovr)&&finite(rel.to.ovr)?rel.to.ovr-rel.from.ovr:null,
    roles_changed:jaccardDistance(rel.from.roles,rel.to.roles)>0,common_stat_count:d.commonStatCount,changed_stat_count:d.changedStatCount,
    stat_delta_sum:d.statDeltaSum,stat_abs_delta_sum:d.statAbsDeltaSum,max_abs_stat_delta:d.maxAbsStatDelta,stat_deltas:d.deltas,
  });
}

const stateNeighbourRows=[];
for (const s of stateFeatures) {
  const candidates=[];
  for (const other of stateFeatures) {
    if (other.stateId===s.stateId || other.playerId===s.playerId || other.statSchema!==s.statSchema) continue;
    const c=compareStateFeatures(s,other); candidates.push({other,c});
  }
  candidates.sort((a,b)=>a.c.distance-b.c.distance||a.other.stateId.localeCompare(b.other.stateId));
  for (const [idx,x] of candidates.slice(0,TOP_STATE_NEIGHBOURS).entries()) stateNeighbourRows.push({
    player_state_id:s.stateId,player_id:s.playerId,player_name:s.playerName,rank:idx+1,
    neighbour_state_id:x.other.stateId,neighbour_player_id:x.other.playerId,neighbour_player_name:x.other.playerName,
    distance:x.c.distance,common_stat_count:x.c.commonStatCount,stat_mad:x.c.statMad,class_mismatch_rate:x.c.classMismatch,
    age_diff:x.c.ageDiff,tier_diff:x.c.tierDiff,ovr_diff:x.c.ovrDiff,role_jaccard_distance:x.c.roleDistance,
  });
}

const responses=responseRows(corpus,stateFeatures,statsByState);
const responseAnalogueRows=[];
for (const r of responses) {
  const candidates=[];
  for (const other of responses) {
    if (other.responseId===r.responseId || other.playerId===r.playerId || other.fitWeight===0) continue;
    const d=responseDistance(r,other,stateFeaturesById); if(d) candidates.push({other,d});
  }
  candidates.sort((a,b)=>a.d.distance-b.d.distance||a.other.responseId.localeCompare(b.other.responseId));
  for (const [idx,x] of candidates.slice(0,TOP_RESPONSE_ANALOGUES).entries()) responseAnalogueRows.push({
    response_id:r.responseId,player_id:r.playerId,player_name:r.playerName,player_state_id:r.playerStateId,stat:r.stat,current_value:r.currentValue,display_class:r.displayClass,
    coach_title:r.coachTitle,multiplier:r.multiplier,transfer_class:r.transferClass,gain_lo:r.gainLo,gain_hi:r.gainHi,rank:idx+1,
    analogue_response_id:x.other.responseId,analogue_player_id:x.other.playerId,analogue_player_name:x.other.playerName,analogue_state_id:x.other.playerStateId,
    analogue_current_value:x.other.currentValue,analogue_display_class:x.other.displayClass,analogue_coach_title:x.other.coachTitle,analogue_multiplier:x.other.multiplier,
    analogue_gain_lo:x.other.gainLo,analogue_gain_hi:x.other.gainHi,distance:x.d.distance,state_distance:x.d.stateDistance,current_stat_diff:x.d.currentStatDiff,
    multiplier_diff:x.d.multiplierDiff,affected_stat_count_diff:x.d.affectedDiff,class_mismatch:x.d.classMismatch,
  });
}

const runs=loadRuns(runsDir);
const experimentRows=[], experimentStateNeighbourRows=[], experimentStatAnalogueRows=[];
for (const {file,rec} of runs) {
  const e=rec.experiment??{}, input=e.input??rec.observation?.input??{}, ef=experimentStateFeature(rec);
  let nearest=null, exact=null;
  if (ef) {
    const candidates=[];
    for (const s of stateFeatures) {
      if (s.statSchema!==ef.statSchema) continue;
      const c=compareStateFeatures(ef,s); candidates.push({s,c});
      const allStats=Object.keys(ef.stats); const exactStats=allStats.length>0&&allStats.every(k=>s.stats[k]===ef.stats[k]);
      if (exactStats && ef.age===s.age && ef.tier===s.tier && jaccardDistance(ef.roles,s.roles)===0) exact = exact ?? s;
    }
    candidates.sort((a,b)=>a.c.distance-b.c.distance||a.s.stateId.localeCompare(b.s.stateId)); nearest=candidates[0]??null;
    for (const [idx,x] of candidates.slice(0,TOP_STATE_NEIGHBOURS).entries()) experimentStateNeighbourRows.push({
      experiment_id:e.experimentId,player_id:e.playerId??input.playerId??'',rank:idx+1,corpus_state_id:x.s.stateId,corpus_player_id:x.s.playerId,corpus_player_name:x.s.playerName,
      distance:x.c.distance,common_stat_count:x.c.commonStatCount,stat_mad:x.c.statMad,class_mismatch_rate:x.c.classMismatch,age_diff:x.c.ageDiff,tier_diff:x.c.tierDiff,ovr_diff:x.c.ovrDiff,role_jaccard_distance:x.c.roleDistance,
      exact_state_match:exact?.stateId===x.s.stateId,
    });
  }
  let compatibleResponses=0;
  for (const obs of rec.observation?.intervals??[]) {
    const target={
      responseId:`RUN:${e.experimentId}:${upper(obs.stat)}`,playerId:e.playerId??input.playerId??'',playerName:'',playerStateId:ef?.stateId,
      stat:upper(obs.stat),currentValue:(input.stats??[]).find(s=>upper(s.stat)===upper(obs.stat))?.displayedStat,
      displayClass:upper((input.stats??[]).find(s=>upper(s.stat)===upper(obs.stat))?.displayClass),
      coachTitle:input.coachLabel??'',multiplier:input.multiplier,transferClass:input.transferClass??'',affectedStatCount:(input.stats??[]).length,
      gainLo:obs.gainLo,gainHi:obs.gainHi,
    };
    const candidates=[];
    for (const other of responses) {
      if (other.playerId===target.playerId || other.fitWeight===0) continue;
      if (target.stat!==other.stat) continue;
      if (target.transferClass&&other.transferClass&&target.transferClass!==other.transferClass) continue;
      compatibleResponses++;
      let sd=null;
      if (ef) {
        const os=stateFeaturesById.get(other.playerStateId);
        if (os&&os.statSchema===ef.statSchema) sd=compareStateFeatures(ef,os);
      }
      if (!sd) continue;
      const multiplierDiff=finite(target.multiplier)&&finite(other.multiplier)?Math.abs(target.multiplier-other.multiplier):null;
      const affectedDiff=finite(target.affectedStatCount)&&finite(other.affectedStatCount)?Math.abs(target.affectedStatCount-other.affectedStatCount):null;
      const classMismatch=target.displayClass&&other.displayClass&&target.displayClass!==other.displayClass?1:0;
      const currentStatDiff=finite(target.currentValue)&&finite(other.currentValue)?Math.abs(target.currentValue-other.currentValue):null;
      const titleMismatch=upper(target.coachTitle)===upper(other.coachTitle)?0:0.5;
      const distance=sd.distance+(multiplierDiff??50)/20+(affectedDiff??5)/3+classMismatch+titleMismatch;
      candidates.push({other,distance,sd,multiplierDiff,affectedDiff,classMismatch,currentStatDiff});
    }
    candidates.sort((a,b)=>a.distance-b.distance||a.other.responseId.localeCompare(b.other.responseId));
    for (const [idx,x] of candidates.slice(0,TOP_RESPONSE_ANALOGUES).entries()) experimentStatAnalogueRows.push({
      experiment_id:e.experimentId,player_id:e.playerId??input.playerId??'',stat:target.stat,current_value:target.currentValue,display_class:target.displayClass,
      observed_gain_lo:target.gainLo,observed_gain_hi:target.gainHi,coach_label:target.coachTitle,multiplier:target.multiplier,transfer_class:target.transferClass,rank:idx+1,
      analogue_response_id:x.other.responseId,analogue_player_id:x.other.playerId,analogue_player_name:x.other.playerName,analogue_state_id:x.other.playerStateId,
      analogue_current_value:x.other.currentValue,analogue_display_class:x.other.displayClass,analogue_coach_title:x.other.coachTitle,analogue_multiplier:x.other.multiplier,
      analogue_gain_lo:x.other.gainLo,analogue_gain_hi:x.other.gainHi,distance:x.distance,state_distance:x.sd.distance,current_stat_diff:x.currentStatDiff,
      multiplier_diff:x.multiplierDiff,affected_stat_count_diff:x.affectedDiff,class_mismatch:x.classMismatch,
    });
  }
  const samePlayerStates=stateFeatures.filter(s=>s.playerId===(e.playerId??input.playerId)).length;
  experimentRows.push({
    experiment_id:e.experimentId,source_file:file,player_id:e.playerId??input.playerId??'',origin_partition:e.originPartition??'',current_partition:e.currentPartition??e.partition??'',status:e.status??'',
    observed_at:e.observedAt??'',age:input.age??'',tier:input.tier??'',coach_label:input.coachLabel??'',multiplier:input.multiplier??'',programme_family:input.programmeFamily??'unknown',transfer_class:input.transferClass??'',
    affected_stat_count:(input.stats??[]).length,observed_stat_count:(rec.observation?.intervals??[]).length,is_duplicate:!!rec.evidence?.isDuplicate,duplicate_of_experiment_id:rec.evidence?.duplicateOfExperimentId??'',fit_weight:rec.evidence?.isDuplicate?0:1,
    state_key_complete:!!ef?.stateComplete,exact_corpus_state_id:exact?.stateId??'',nearest_corpus_state_id:nearest?.s.stateId??'',nearest_corpus_player_id:nearest?.s.playerId??'',nearest_corpus_player_name:nearest?.s.playerName??'',nearest_state_distance:nearest?.c.distance??'',
    same_player_corpus_state_count:samePlayerStates,compatible_historical_response_rows:compatibleResponses,score_count:(rec.scores??[]).length,
  });
}
.stat!==other.stat) continue;
      if (target.transferClass&&other.transferClass&&target.transferClass!==other.transferClass) continue;
      compatibleResponses++;
      let sd=null;
      if (ef) {
        const os=stateFeaturesById.get(other.playerStateId);
        if (os&&os.statSchema===ef.statSchema) sd=compareStateFeatures(ef,os);
      }
      if (!sd) continue;
      const multiplierDiff=finite(target.multiplier)&&finite(other.multiplier)?Math.abs(target.multiplier-other.multiplier):null;
      const affectedDiff=finite(target.affectedStatCount)&&finite(other.affectedStatCount)?Math.abs(target.affectedStatCount-other.affectedStatCount):null;
      const classMismatch=target.displayClass&&other.displayClass&&target.displayClass!==other.displayClass?1:0;
      const currentStatDiff=finite(target.currentValue)&&finite(other.currentValue)?Math.abs(target.currentValue-other.currentValue):null;
      const titleMismatch=upper(target.coachTitle)===upper(other.coachTitle)?0:0.5;
      const distance=sd.distance+(multiplierDiff??50)/20+(affectedDiff??5)/3+classMismatch+titleMismatch;
      candidates.push({other,distance,sd,multiplierDiff,affectedDiff,classMismatch,currentStatDiff});
    }
    candidates.sort((a,b)=>a.distance-b.distance||a.other.responseId.localeCompare(b.other.responseId));
    for (const [idx,x] of candidates.slice(0,TOP_RESPONSE_ANALOGUES).entries()) experimentStatAnalogueRows.push({
      experiment_id:e.experimentId,player_id:e.playerId??input.playerId??'',stat:target.stat,current_value:target.currentValue,display_class:target.displayClass,
      observed_gain_lo:target.gainLo,observed_gain_hi:target.gainHi,coach_label:target.coachTitle,multiplier:target.multiplier,transfer_class:target.transferClass,rank:idx+1,
      analogue_response_id:x.other.responseId,analogue_player_id:x.other.playerId,analogue_player_name:x.other.playerName,analogue_state_id:x.other.playerStateId,
      analogue_current_value:x.other.currentValue,analogue_display_class:x.other.displayClass,analogue_coach_title:x.other.coachTitle,analogue_multiplier:x.other.multiplier,
      analogue_gain_lo:x.other.gainLo,analogue_gain_hi:x.other.gainHi,distance:x.distance,state_distance:x.sd.distance,current_stat_diff:x.currentStatDiff,
      multiplier_diff:x.multiplierDiff,affected_stat_count_diff:x.affectedDiff,class_mismatch:x.classMismatch,
    });
  }
  const samePlayerStates=stateFeatures.filter(s=>s.playerId===(e.playerId??input.playerId)).length;
  experimentRows.push({
    experiment_id:e.experimentId,source_file:file,player_id:e.playerId??input.playerId??'',origin_partition:e.originPartition??'',current_partition:e.currentPartition??e.partition??'',status:e.status??'',
    observed_at:e.observedAt??'',age:input.age??'',tier:input.tier??'',coach_label:input.coachLabel??'',multiplier:input.multiplier??'',programme_family:input.programmeFamily??'unknown',transfer_class:input.transferClass??'',
    affected_stat_count:(input.stats??[]).length,observed_stat_count:(rec.observation?.intervals??[]).length,is_duplicate:!!rec.evidence?.isDuplicate,duplicate_of_experiment_id:rec.evidence?.duplicateOfExperimentId??'',fit_weight:rec.evidence?.isDuplicate?0:1,
    state_key_complete:!!ef?.stateComplete,exact_corpus_state_id:exact?.stateId??'',nearest_corpus_state_id:nearest?.s.stateId??'',nearest_corpus_player_id:nearest?.s.playerId??'',nearest_corpus_player_name:nearest?.s.playerName??'',nearest_state_distance:nearest?.c.distance??'',
    same_player_corpus_state_count:samePlayerStates,compatible_historical_response_rows:compatibleResponses,score_count:(rec.scores??[]).length,
  });
}

writeCsv('state_pairs.csv',[
  'player_id','player_name','from_state_id','to_state_id','relation','is_causal_transition','from_regime','to_regime','from_sequence','to_sequence','from_observed_at','to_observed_at','age_delta','tier_delta','ovr_delta','roles_changed','common_stat_count','changed_stat_count','stat_delta_sum','stat_abs_delta_sum','max_abs_stat_delta','stat_deltas'
],statePairRows);
writeCsv('state_neighbours.csv',[
  'player_state_id','player_id','player_name','rank','neighbour_state_id','neighbour_player_id','neighbour_player_name','distance','common_stat_count','stat_mad','class_mismatch_rate','age_diff','tier_diff','ovr_diff','role_jaccard_distance'
],stateNeighbourRows);
writeCsv('response_rows.csv',[
  'responseId','previewId','playerId','playerName','playerStateId','age','tier','ovr','roles','statSchema','stat','currentValue','displayClass','gainLo','gainHi','coachId','coachInstanceId','coachTitle','coachClass','multiplier','transferClass','rewardStatus','affectedStatCount','sourceId','sourceScreenshot','isDuplicateEvidence','duplicateOfResponseId','fitWeight'
],responses);
writeCsv('response_analogues.csv',[
  'response_id','player_id','player_name','player_state_id','stat','current_value','display_class','coach_title','multiplier','transfer_class','gain_lo','gain_hi','rank','analogue_response_id','analogue_player_id','analogue_player_name','analogue_state_id','analogue_current_value','analogue_display_class','analogue_coach_title','analogue_multiplier','analogue_gain_lo','analogue_gain_hi','distance','state_distance','current_stat_diff','multiplier_diff','affected_stat_count_diff','class_mismatch'
],responseAnalogueRows);
writeCsv('experiment_metrics.csv',[
  'experiment_id','source_file','player_id','origin_partition','current_partition','status','observed_at','age','tier','coach_label','multiplier','programme_family','transfer_class','affected_stat_count','observed_stat_count','is_duplicate','duplicate_of_experiment_id','fit_weight','state_key_complete','exact_corpus_state_id','nearest_corpus_state_id','nearest_corpus_player_id','nearest_corpus_player_name','nearest_state_distance','same_player_corpus_state_count','compatible_historical_response_rows','score_count'
],experimentRows);
writeCsv('experiment_state_neighbours.csv',[
  'experiment_id','player_id','rank','corpus_state_id','corpus_player_id','corpus_player_name','distance','common_stat_count','stat_mad','class_mismatch_rate','age_diff','tier_diff','ovr_diff','role_jaccard_distance','exact_state_match'
],experimentStateNeighbourRows);
writeCsv('experiment_stat_analogues.csv',[
  'experiment_id','player_id','stat','current_value','display_class','observed_gain_lo','observed_gain_hi','coach_label','multiplier','transfer_class','rank','analogue_response_id','analogue_player_id','analogue_player_name','analogue_state_id','analogue_current_value','analogue_display_class','analogue_coach_title','analogue_multiplier','analogue_gain_lo','analogue_gain_hi','distance','state_distance','current_stat_diff','multiplier_diff','affected_stat_count_diff','class_mismatch'
],experimentStatAnalogueRows);

const summary={
  schemaVersion:'resource-coach-longitudinal-analysis-v1',
  analysisScope:'all-corpus-states-and-all-immutable-runs',
  corpusSchemaVersion:root.schemaVersion,
  corpusSource:root.source??{},
  counts:{
    players:corpus.players.length,playerStates:stateFeatures.length,completePlayerStates:stateFeatures.filter(s=>s.stateComplete).length,
    multiStatePlayers:[...statesByPlayer.values()].filter(a=>a.length>1).length,samePlayerStatePairs:statePairRows.length,
    linkedLongitudinalPairs:statePairRows.filter(r=>r.relation==='linked-longitudinal-observations').length,
    exactReobservations:statePairRows.filter(r=>r.relation==='exact-reobservation').length,
    verifiedDirectTransitions:statePairRows.filter(r=>r.is_causal_transition).length,
    coachDefinitions:corpus.coachDefinitions.length,coachInstances:corpus.coachInstances.length,coachPreviews:corpus.coachPreviews.length,
    observedResponseRows:responses.length,uniqueObservedResponseRows:responses.filter(r=>r.fitWeight===1).length,duplicateObservedResponseRows:responses.filter(r=>r.fitWeight===0).length,responseAnalogueRows:responseAnalogueRows.length,immutableExperimentRuns:runs.length,
    experimentMetricRows:experimentRows.length,experimentStateNeighbourRows:experimentStateNeighbourRows.length,experimentStatAnalogueRows:experimentStatAnalogueRows.length,
  },
  integrity:{
    allStateStatsRetained:corpus.playerStateStats.length,
    sourceDeclaredStateTransitions:corpus.stateTransitions.length,
    noInferredCausalTransitions:statePairRows.filter(r=>r.is_causal_transition).length===corpus.stateTransitions.length,
    heuristicDistancesAreDescriptiveOnly:true,
    duplicateExperimentWeighting:'duplicates retained; fit_weight=0',
  },
  notes:[
    'One run indexes the complete corpus; it does not select and persist one player at a time.',
    'Same-player state pairs are longitudinal comparisons unless the corpus explicitly records a verified direct transition.',
    'Exact re-observations are reported separately and are not counted as transitions.',
    'State and response neighbour distances are deterministic similarity heuristics for retrieval/analysis, not fitted game equations.',
    'Experiment intake is evaluated against the complete corpus in the same pass and emits per-experiment state and response analogues.'
  ]
};
fs.writeFileSync(path.join(outDir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const md=[
  '## Corpus-wide longitudinal analysis','',
  `- Players: **${summary.counts.players}** · states: **${summary.counts.playerStates}** · multi-state players: **${summary.counts.multiStatePlayers}**`,
  `- Same-player state comparisons: **${summary.counts.samePlayerStatePairs}** · linked longitudinal: **${summary.counts.linkedLongitudinalPairs}** · exact re-observations: **${summary.counts.exactReobservations}**`,
  `- Verified direct causal transitions: **${summary.counts.verifiedDirectTransitions}** (only source-declared transitions count)`,
  `- Observed coach-response stat rows: **${summary.counts.observedResponseRows}** raw / **${summary.counts.uniqueObservedResponseRows}** unique · corpus analogue rows: **${summary.counts.responseAnalogueRows}**`,
  `- Immutable experiment runs analyzed in the same pass: **${summary.counts.immutableExperimentRuns}** · experiment metric rows: **${summary.counts.experimentMetricRows}**`,
  '',
  'Analysis is corpus-wide. Similarity distances are descriptive retrieval metrics, not fitted transfer equations.'
].join('\n');
fs.writeFileSync(path.join(outDir,'summary.md'),md+'\n');
console.log(JSON.stringify(summary,null,2));
