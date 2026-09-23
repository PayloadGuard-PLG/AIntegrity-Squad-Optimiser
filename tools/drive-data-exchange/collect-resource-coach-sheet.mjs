import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
  if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort())o[k]=stable(v[k]);return o;}
  return v;
}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function runNode(script,args){return execFileSync(process.execPath,[script,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
function xmlDecode(s=''){
  return String(s)
    .replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"')
    .replaceAll('&apos;',"'").replaceAll('&amp;','&')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function colIndex(ref){
  const m=String(ref).match(/^([A-Z]+)/i); if(!m)return 0;
  let n=0; for(const ch of m[1].toUpperCase())n=n*26+(ch.charCodeAt(0)-64);
  return n-1;
}
function unzipText(file,entry,optional=false){
  try{return execFileSync('unzip',['-p',file,entry],{encoding:'utf8',maxBuffer:64*1024*1024});}
  catch(e){if(optional)return '';throw new Error(`Unable to read XLSX entry ${entry}: ${String(e.stderr||e.message||e).slice(0,400)}`);}
}
function parseSharedStrings(xml){
  if(!xml)return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>{
    const parts=[...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x=>xmlDecode(x[1]));
    return parts.join('');
  });
}
function parseWorkbookSheets(workbookXml,relsXml){
  const rels=new Map([...relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m=>[m[1],m[2]]));
  const out=new Map();
  for(const m of workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)){
    const target=rels.get(m[2]); if(!target)continue;
    out.set(xmlDecode(m[1]),target.startsWith('/')?target.slice(1):`xl/${target.replace(/^\.\//,'')}`);
  }
  return out;
}
function parseSheetXml(xml,sharedStrings){
  const rows=[];
  for(const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
    const row=[];
    for(const cm of rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){
      const attrs=cm[1], body=cm[2];
      const ref=(attrs.match(/\br="([^"]+)"/)||[])[1]||'A1';
      const type=(attrs.match(/\bt="([^"]+)"/)||[])[1]||'';
      let value='';
      if(type==='inlineStr'){
        value=[...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x=>xmlDecode(x[1])).join('');
      }else{
        const vm=body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const raw=vm?xmlDecode(vm[1]):'';
        if(type==='s')value=sharedStrings[Number(raw)]??'';
        else if(type==='b')value=raw==='1';
        else if(type==='str')value=raw;
        else if(raw!==''&&Number.isFinite(Number(raw)))value=Number(raw);
        else value=raw;
      }
      row[colIndex(ref)]=value;
    }
    while(row.length&&row[row.length-1]===undefined)row.pop();
    for(let i=0;i<row.length;i++)if(row[i]===undefined)row[i]='';
    rows.push(row);
  }
  return rows;
}
async function exportSpreadsheet(token,spreadsheetId){
  const mime=encodeURIComponent(XLSX_MIME);
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}/export?mimeType=${mime}`;
  const res=await fetch(url,{headers:{authorization:`Bearer ${token}`}});
  if(!res.ok){const body=await res.text();throw new Error(`Drive spreadsheet export failed (${res.status}): ${body.slice(0,700)}`);}
  return Buffer.from(await res.arrayBuffer());
}
function readWorkbookTables(xlsxPath,names){
  const workbook=unzipText(xlsxPath,'xl/workbook.xml');
  const rels=unzipText(xlsxPath,'xl/_rels/workbook.xml.rels');
  const shared=parseSharedStrings(unzipText(xlsxPath,'xl/sharedStrings.xml',true));
  const sheetMap=parseWorkbookSheets(workbook,rels);
  const out=new Map();
  for(const name of names){
    const entry=sheetMap.get(name);
    if(!entry)throw new Error(`Exported workbook is missing required sheet ${name}.`);
    out.set(name,parseSheetXml(unzipText(xlsxPath,entry),shared));
  }
  return out;
}
function semanticFromSheet(exp,obsRows){
  return {
    experimentId:text(exp.experiment_id),playerId:text(exp.player_id),status:text(exp.status),observedAt:text(exp.observed_at),
    age:num(exp.player_age),tier:text(exp.tier),stateKey:text(exp.state_key),sourceFamily:text(exp.source_family),
    sourceFamilySource:text(exp.source_family_source),transferClass:text(exp.transfer_class),
    transferClassSource:text(exp.transfer_class_source),coachLabel:text(exp.coach_label),multiplier:num(exp.displayed_multiplier),
    programmeFamily:text(exp.programme_family)||'unknown',programmeFamilySource:text(exp.programme_family_source),
    targetSource:text(exp.target_source),
    evidence:{fingerprint:text(exp.evidence_fingerprint),isDuplicate:bool(exp.is_duplicate),duplicateOfExperimentId:nullable(exp.duplicate_of_experiment_id)},
    stats:sortStats(obsRows.map(r=>({stat:text(r.stat),displayedStat:num(r.displayed_stat),displayClass:text(r.display_class),classSource:text(r.class_source),
      gainLo:num(r.gain_lo),gainHi:num(r.gain_hi),evidenceKind:text(r.evidence_kind),evidenceSource:text(r.evidence_source)}))),
  };
}
function semanticFromRun(rec){
  const e=rec.experiment??{},input=e.input??rec.observation?.input??{},o=rec.observation??{};
  const statMap=new Map((input.stats??[]).map(s=>[s.stat,s]));
  return {
    experimentId:text(e.experimentId),playerId:text(e.playerId??input.playerId),status:text(e.status),observedAt:text(e.observedAt??o.capturedAt),
    age:num(input.age),tier:text(input.tier),stateKey:text(input.stateKey),sourceFamily:text(input.sourceFamily),
    sourceFamilySource:text(input.sourceFamilySource),transferClass:text(input.transferClass),
    transferClassSource:text(input.transferClassSource),coachLabel:text(input.coachLabel),multiplier:num(input.multiplier),
    programmeFamily:text(input.programmeFamily)||'unknown',programmeFamilySource:text(input.programmeFamilySource),
    targetSource:text(input.targetSource),
    evidence:{fingerprint:text(rec.evidence?.fingerprint),isDuplicate:!!rec.evidence?.isDuplicate,duplicateOfExperimentId:nullable(rec.evidence?.duplicateOfExperimentId)},
    stats:sortStats((o.intervals??[]).map(r=>{const s=statMap.get(r.stat)??{};return {
      stat:text(r.stat),displayedStat:num(s.displayedStat),displayClass:text(s.displayClass),classSource:text(s.classSource),gainLo:num(r.gainLo),gainHi:num(r.gainHi),
      evidenceKind:text(o.evidenceKind),evidenceSource:text(o.source)};})),
  };
}
function buildRecord(exp,obsRows,partitionRows){
  const ids=new Set(obsRows.map(r=>text(r.experiment_id)));
  if(ids.size!==1||!ids.has(text(exp.experiment_id)))throw new Error('Observed-stat join is inconsistent.');
  if(text(exp.status)!=='observed')throw new Error(`Experiment ${exp.experiment_id} is not sealed observed evidence.`);
  if(!text(exp.observed_at))throw new Error(`Experiment ${exp.experiment_id} lacks observed_at.`);
  if(obsRows.length===0)throw new Error(`Experiment ${exp.experiment_id} has no observed stat rows.`);
  const sourceFields=['transfer_class','transfer_class_source','coach_label','programme_family','displayed_multiplier','affected_stat_count','player_age','tier','target_source','source_family_source','programme_family_source'];
  for(const key of sourceFields){const vals=new Set(obsRows.map(r=>JSON.stringify(r[key]??'')));if(vals.size>1)throw new Error(`Experiment ${exp.experiment_id} has inconsistent Observed_Stats.${key} values.`);}
  const stats=sortStats(obsRows.map(r=>({stat:text(r.stat),displayedStat:num(r.displayed_stat),displayClass:text(r.display_class),classSource:text(r.class_source)})));
  if(stats.some(s=>!s.stat||s.displayedStat===null||!s.displayClass||!s.classSource))throw new Error(`Experiment ${exp.experiment_id} has incomplete stat/class observations or class provenance.`);
  const intervals=sortStats(obsRows.map(r=>({stat:text(r.stat),gainLo:num(r.gain_lo),gainHi:num(r.gain_hi)})));
  if(intervals.some(s=>s.gainLo===null||s.gainHi===null))throw new Error(`Experiment ${exp.experiment_id} has incomplete gain intervals.`);
  const evidenceKinds=new Set(obsRows.map(r=>text(r.evidence_kind))),evidenceSources=new Set(obsRows.map(r=>text(r.evidence_source)));
  if(evidenceKinds.size!==1||evidenceSources.size!==1)throw new Error(`Experiment ${exp.experiment_id} has inconsistent observation provenance.`);
  const input={playerId:text(exp.player_id),age:num(exp.player_age),tier:text(exp.tier),stateKey:text(exp.state_key),sourceFamily:text(exp.source_family),
    sourceFamilySource:text(exp.source_family_source),transferClass:text(exp.transfer_class),transferClassSource:text(exp.transfer_class_source),
    coachLabel:text(exp.coach_label),multiplier:num(exp.displayed_multiplier),programmeFamily:text(exp.programme_family)||'unknown',
    programmeFamilySource:text(exp.programme_family_source),targetSource:text(exp.target_source),stats};
  const partitionHistory=partitionRows.sort((a,b)=>(num(a.event_seq)??0)-(num(b.event_seq)??0)).map(r=>({
    eventSeq:num(r.event_seq),recordedAt:text(r.recorded_at),eventKind:text(r.event_kind),fromPartition:nullable(r.from_partition),
    toPartition:nullable(r.to_partition),note:text(r.note)}));
  return {schemaVersion:'resource-coach-experiment-v1',
    experiment:{experimentId:text(exp.experiment_id),playerId:text(exp.player_id),createdAt:text(exp.created_at),partition:text(exp.partition),
      originPartition:nullable(exp.origin_partition),currentPartition:text(exp.current_partition||exp.partition),promotedAt:nullable(exp.promoted_at),
      partitionHistory,status:'observed',observedAt:text(exp.observed_at),input},
    evidence:{fingerprint:text(exp.evidence_fingerprint),isDuplicate:bool(exp.is_duplicate),duplicateOfExperimentId:nullable(exp.duplicate_of_experiment_id),detectedAt:text(exp.evidence_detected_at)},
    observation:{id:text(exp.experiment_id),capturedAt:text(exp.observed_at),input,intervals,evidenceKind:[...evidenceKinds][0],source:[...evidenceSources][0]},
    sourceProvenance:{kind:'google-sheet-mirror',spreadsheetId:null,reconstructedFrom:['Experiments','Observed_Stats','Partition_History']},
  };
}

export {rowObjects,xmlDecode,colIndex,parseSharedStrings,parseWorkbookSheets,parseSheetXml,readWorkbookTables,semanticFromSheet,semanticFromRun,buildRecord,digest};

export async function collectResourceCoachSheet({token,spreadsheetId,stagedRuns,outDir,ingestScript}){
  const bytes=await exportSpreadsheet(token,spreadsheetId);
  const exportSha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const xlsxPath=path.join(outDir,`resource-coach-sheet-${spreadsheetId}.xlsx`);
  fs.writeFileSync(xlsxPath,bytes);
  const tables=readWorkbookTables(xlsxPath,['Experiments','Observed_Stats','Partition_History']);
  const experiments=rowObjects(tables.get('Experiments')),observed=rowObjects(tables.get('Observed_Stats')),partitions=rowObjects(tables.get('Partition_History'));
  const obsById=new Map(),partById=new Map();
  for(const r of observed){const id=text(r.experiment_id);if(!obsById.has(id))obsById.set(id,[]);obsById.get(id).push(r);}
  for(const r of partitions){const id=text(r.experiment_id);if(!partById.has(id))partById.set(id,[]);partById.get(id).push(r);}
  const records=[];let mirrorMatches=0,mirrorConflicts=0,newExperiments=0,invalid=0;
  for(const exp of experiments){
    const id=text(exp.experiment_id);if(!id){invalid++;records.push({experiment_id:null,status:'INVALID_MISSING_ID'});continue;}
    const obsRows=obsById.get(id)??[],sourceHash=digest({experiment:exp,observedStats:obsRows,partitionHistory:partById.get(id)??[]});
    const dest=path.join(stagedRuns,`${id}.json`);
    if(fs.existsSync(dest)){
      try{
        const existing=JSON.parse(fs.readFileSync(dest,'utf8')),expected=semanticFromSheet(exp,obsRows),actual=semanticFromRun(existing);
        if(JSON.stringify(stable(expected))!==JSON.stringify(stable(actual))){
          mirrorConflicts++;records.push({experiment_id:id,status:'MIRROR_CONFLICT_EXISTING',source_sha256:sourceHash,expected,actual});
        }else{mirrorMatches++;records.push({experiment_id:id,status:'MIRROR_MATCH_EXISTING',source_sha256:sourceHash});}
      }catch(e){mirrorConflicts++;records.push({experiment_id:id,status:'MIRROR_COMPARE_ERROR',source_sha256:sourceHash,detail:String(e.message||e).slice(0,700)});}
      continue;
    }
    try{
      const rec=buildRecord(exp,obsRows,partById.get(id)??[]);rec.sourceProvenance.spreadsheetId=spreadsheetId;
      const tmp=path.join(outDir,`sheet-${id}.json`);fs.writeFileSync(tmp,JSON.stringify(rec,null,2)+'\n');runNode(ingestScript,[tmp,stagedRuns]);
      newExperiments++;records.push({experiment_id:id,status:'STAGED_NEW_SHEET_EXPERIMENT',source_sha256:sourceHash});
    }catch(e){invalid++;records.push({experiment_id:id,status:'REJECTED_INCOMPLETE_SHEET_EXPERIMENT',source_sha256:sourceHash,detail:String(e.stderr||e.message||e).slice(0,700).trim()});}
  }
  const summary={schemaVersion:'resource-coach-sheet-collection-v1',transport:'drive-xlsx-export',spreadsheetId,exportSha256,exportBytes:bytes.length,
    experimentRows:experiments.length,observedStatRows:observed.length,partitionRows:partitions.length,mirrorMatches,mirrorConflicts,newExperiments,invalid};
  fs.writeFileSync(path.join(outDir,'sheet-source-manifest.json'),JSON.stringify({summary,records},null,2)+'\n');
  if(mirrorConflicts>0)throw new Error(`Resource Coach Sheet mirror conflicts with ${mirrorConflicts} immutable experiment(s).`);
  return summary;
}
