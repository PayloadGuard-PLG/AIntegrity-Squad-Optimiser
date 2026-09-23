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
    