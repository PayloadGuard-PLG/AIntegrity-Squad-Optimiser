import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const SHEETS_READ_SCOPE='https://www.googleapis.com/auth/spreadsheets.readonly';

function a1(name){return `'${String(name).replaceAll("'","''")}'!A1:AZ5000`;}
function rowObjects(values=[]){
  if(!Array.isArray(values)||values.length===0)return [];
  const [headers,...rows]=values;
  return rows.filter(r=>r.some(v=>v!==''&&v!==null&&v!==undefined)).map(r=>{
    const o={};
    headers.forEach((h,i)=>o[String(h)]=r[i]??'');
    return o;
  });
}
function num(v){if(v===''||v===null||v===undefined)return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function bool(v){return v===true||String(v).toLowerCase()==='true';}
function text(v){return v===null||v===undefined?'':String(v);}
function nullable(v){const s=text(v);return s===''?null:s;}
function sortStats(xs){return [...xs].sort((a,b)=>String(a.stat).localeCompare(String(b.stat)));}
function stable(v){
  if(Array.isArray(v))return v.map(stable);
  if(v&&typeof v==='object'){
    const o={}; for(const k of Object.keys(v).sort())o[k]=stable(v[k]); return o;
  }
  return v;
}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function runNode(script,args){
  return execFileSync(process.execPath,[script,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
}
async function sheetsBatchGet(token,spreadsheetId,ranges){
  const p=new URLSearchParams();
  for(const r of ranges)p.append('ranges',r);
  p.set('majorDimension','ROWS');
  p.set('valueRenderOption','UNFORMATTED_VALUE');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${p}`;
  const res=await fetch(url,{headers:{authorization:`Bearer ${token}`}});
  const body=await res.text();
  if(!res.ok)throw new Error(`Google Sheets API failed (${res.status}): ${body.slice(0,700)}`);
  return JSON.parse(body);
}
function semanticFromSheet(exp,obsRows){
  return {
    experimentId:text(exp.experiment_id),
    playerId:text(exp.player_id),
    status:text(exp.status),
    observedAt:text(exp.observed_at),
    age:num(exp.player_age),
    tier:text(exp.tier),
    stateKey:text(exp.state_key),
    sourceFamily:text(exp.source_family),
    sourceFamilySource:text(exp.source_family_source),
    transferClass:text(exp.transfer_class),
    transferClassSource:text(exp.transfer_class_source),
    coachLabel:text(exp.coach_label),
    multiplier:num(exp.displayed_multiplier),
    programmeFamily:text(exp.programme_family)||'unknown',
    programmeFamilySource:text(exp.programme_family_source),
    targetSource:text(exp.target_source),
    evidence:{
      fingerprint:text(exp.evidence_fingerprint),
      isDuplicate:bool(exp.is_duplicate),
      duplicateOfExperimentId:nullable(exp.duplicate_of_experiment_id),
    },
    stats:sortStats(obsRows.map(r=>({
      stat:text(r.stat),
      displayedStat:num(r.displayed_stat),
      displayClass:text(r.display_class),
      gainLo:num(r.gain_lo),
      gainHi:num(r.gain_hi),
      evidenceKind:text(r.evidence_kind),
      evidenceSource:text(r.evidence_source),
    }))),
  };
}
function semanticFromRun(rec){
  const e=rec.experiment??{}, input=e.input??rec.observation?.input??{}, o=rec.observation??{};
  const statMap=new Map((input.stats??[]).map(s=>[s.stat,s]));
  return {
    experimentId:text(e.experimentId),
    playerId:text(e.playerId??input.playerId),
    status:text(e.status),
    observedAt:text(e.observedAt??o.capturedAt),
    age:num(input.age),
    tier:text(input.tier),
    stateKey:text(input.stateKey),
    sourceFamily:text(input.sourceFamily),
    sourceFamilySource:text(input.sourceFamilySource),
    transferClass:text(input.transferClass),
    transferClassSource:text(input.transferClassSource),
    coachLabel:text(input.coachLabel),
    multiplier:num(input.multiplier),
    programmeFamily:text(input.programmeFamily)||'unknown',
    programmeFamilySource:text(input.programmeFamilySource),
    targetSource:text(input.targetSource),
    evidence:{
      fingerprint:text(rec.evidence?.fingerprint),
      isDuplicate:!!rec.evidence?.isDuplicate,
      duplicateOfExperimentId:nullable(rec.evidence?.duplicateOfExperimentId),
    },
    stats:sortStats((o.intervals??[]).map(r=>{
      const s=statMap.get(r.stat)??{};
      return {
        stat:text(r.stat),
        displayedStat:num(s.displayedStat),
        displayClass:text(s.displayClass),
        gainLo:num(r.gainLo),
        gainHi:num(r.gainHi),
        evidenceKind:text(o.evidenceKind),
        evidenceSource:text(o.source),
      };
    })),
  };
}
function buildRecord(exp,obsRows,partitionRows){
  const ids=new Set(obsRows.map(r=>text(r.experiment_id)));
  if(ids.size!==1||!ids.has(text(exp.experiment_id)))throw new Error('Observed-stat join is inconsistent.');
  if(text(exp.status)!=='observed')throw new Error(`Experiment ${exp.experiment_id} is not sealed observed evidence.`);
  if(!text(exp.observed_at))throw new Error(`Experiment ${exp.experiment_id} lacks observed_at.`);
  if(obsRows.length===0)throw new Error(`Experiment ${exp.experiment_id} has no observed stat rows.`);

  const sourceFields=['transfer_class','transfer_class_source','coach_label','programme_family','displayed_multiplier','affected_stat_count','player_age','tier','target_source','source_family_source','programme_family_source'];
  for(const key of sourceFields){
    const vals=new Set(obsRows.map(r=>JSON.stringify(r[key]??'')));
    if(vals.size>1)throw new Error(`Experiment ${exp.experiment_id} has inconsistent Observed_Stats.${key} values.`);
  }
  const stats=sortStats(obsRows.map(r=>({
    stat:text(r.stat),
    displayedStat:num(r.displayed_stat),
    displayClass:text(r.display_class),
    classSource:'sheet-observed',
  })));
  if(stats.some(s=>!s.stat||s.displayedStat===null||!s.displayClass))throw new Error(`Experiment ${exp.experiment_id} has incomplete stat/class observations.`);
  const intervals=sortStats(obsRows.map(r=>({
    stat:text(r.stat),gainLo:num(r.gain_lo),gainHi:num(r.gain_hi)
  })));
  if(intervals.some(s=>s.gainLo===null||s.gainHi===null))throw new Error(`Experiment ${exp.experiment_id} has incomplete gain intervals.`);
  const evidenceKinds=new Set(obsRows.map(r=>text(r.evidence_kind)));
  const evidenceSources=new Set(obsRows.map(r=>text(r.evidence_source)));
  if(evidenceKinds.size!==1||evidenceSources.size!==1)throw new Error(`Experiment ${exp.experiment_id} has inconsistent observation provenance.`);

  const input={
    playerId:text(exp.player_id),
    age:num(exp.player_age),
    tier:text(exp.tier),
    stateKey:text(exp.state_key),
    sourceFamily:text(exp.source_family),
    sourceFamilySource:text(exp.source_family_source),
    transferClass:text(exp.transfer_class),
    transferClassSource:text(exp.transfer_class_source),
    coachLabel:text(exp.coach_label),
    multiplier:num(exp.displayed_multiplier),
    programmeFamily:text(exp.programme_family)||'unknown',
    programmeFamilySource:text(exp.programme_family_source),
    targetSource:text(exp.target_source),
    stats,
  };
  const partitionHistory=partitionRows
    .sort((a,b)=>(num(a.event_seq)??0)-(num(b.event_seq)??0))
    .map(r=>({
      eventSeq:num(r.event_seq),
      recordedAt:text(r.recorded_at),
      eventKind:text(r.event_kind),
      fromPartition:nullable(r.from_partition),
      toPartition:nullable(r.to_partition),
      note:text(r.note),
    }));
  return {
    schemaVersion:'resource-coach-experiment-v1',
    experiment:{
      experimentId:text(exp.experiment_id),
      playerId:text(exp.player_id),
      createdAt:text(exp.created_at),
      partition:text(exp.partition),
      originPartition:nullable(exp.origin_partition),
      currentPartition:text(exp.current_partition||exp.partition),
      promotedAt:nullable(exp.promoted_at),
      partitionHistory,
      status:'observed',
      observedAt:text(exp.observed_at),
      input,
    },
    evidence:{
      fingerprint:text(exp.evidence_fingerprint),
      isDuplicate:bool(exp.is_duplicate),
      duplicateOfExperimentId:nullable(exp.duplicate_of_experiment_id),
      detectedAt:text(exp.evidence_detected_at),
    },
    observation:{
      id:text(exp.experiment_id),
      capturedAt:text(exp.observed_at),
      input,
      intervals,
      evidenceKind:[...evidenceKinds][0],
      source:[...evidenceSources][0],
    },
    sourceProvenance:{
      kind:'google-sheet-mirror',
      spreadsheetId:null,
      reconstructedFrom:['Experiments','Observed_Stats','Partition_History'],
    },
  };
}

export {rowObjects,semanticFromSheet,semanticFromRun,buildRecord,digest};

export async function collectResourceCoachSheet({token,spreadsheetId,stagedRuns,outDir,ingestScript}){
  const data=await sheetsBatchGet(token,spreadsheetId,[a1('Experiments'),a1('Observed_Stats'),a1('Partition_History')]);
  const maps=new Map((data.valueRanges??[]).map(v=>[v.range?.split('!')[0]?.replaceAll("'",""),v.values??[]]));
  const experiments=rowObjects(maps.get('Experiments')??[]);
  const observed=rowObjects(maps.get('Observed_Stats')??[]);
  const partitions=rowObjects(maps.get('Partition_History')??[]);
  const obsById=new Map(), partById=new Map();
  for(const r of observed){const id=text(r.experiment_id);if(!obsById.has(id))obsById.set(id,[]);obsById.get(id).push(r);}
  for(const r of partitions){const id=text(r.experiment_id);if(!partById.has(id))partById.set(id,[]);partById.get(id).push(r);}

  const records=[];
  let mirrorMatches=0,mirrorConflicts=0,newExperiments=0,invalid=0;
  for(const exp of experiments){
    const id=text(exp.experiment_id);
    if(!id){invalid++;records.push({experiment_id:null,status:'INVALID_MISSING_ID'});continue;}
    const obsRows=obsById.get(id)??[];
    const sourceHash=digest({experiment:exp,observedStats:obsRows,partitionHistory:partById.get(id)??[]});
    const dest=path.join(stagedRuns,`${id}.json`);
    if(fs.existsSync(dest)){
      try{
        const existing=JSON.parse(fs.readFileSync(dest,'utf8'));
        const expected=semanticFromSheet(exp,obsRows);
        const actual=semanticFromRun(existing);
        if(JSON.stringify(stable(expected))!==JSON.stringify(stable(actual))){
          mirrorConflicts++;
          records.push({experiment_id:id,status:'MIRROR_CONFLICT_EXISTING',source_sha256:sourceHash,expected,actual});
        }else{
          mirrorMatches++;
          records.push({experiment_id:id,status:'MIRROR_MATCH_EXISTING',source_sha256:sourceHash});
        }
      }catch(e){
        mirrorConflicts++;
        records.push({experiment_id:id,status:'MIRROR_COMPARE_ERROR',source_sha256:sourceHash,detail:String(e.message||e).slice(0,700)});
      }
      continue;
    }
    try{
      const rec=buildRecord(exp,obsRows,partById.get(id)??[]);
      rec.sourceProvenance.spreadsheetId=spreadsheetId;
      const tmp=path.join(outDir,`sheet-${id}.json`);
      fs.writeFileSync(tmp,JSON.stringify(rec,null,2)+'\n');
      runNode(ingestScript,[tmp,stagedRuns]);
      newExperiments++;
      records.push({experiment_id:id,status:'STAGED_NEW_SHEET_EXPERIMENT',source_sha256:sourceHash});
    }catch(e){
      invalid++;
      records.push({experiment_id:id,status:'REJECTED_INCOMPLETE_SHEET_EXPERIMENT',source_sha256:sourceHash,detail:String(e.stderr||e.message||e).slice(0,700).trim()});
    }
  }

  const summary={
    schemaVersion:'resource-coach-sheet-collection-v1',
    spreadsheetId,
    experimentRows:experiments.length,
    observedStatRows:observed.length,
    partitionRows:partitions.length,
    mirrorMatches,
    mirrorConflicts,
    newExperiments,
    invalid,
  };
  fs.writeFileSync(path.join(outDir,'sheet-source-manifest.json'),JSON.stringify({summary,records},null,2)+'\n');
  if(mirrorConflicts>0)throw new Error(`Resource Coach Sheet mirror conflicts with ${mirrorConflicts} immutable experiment(s).`);
  return summary;
}
