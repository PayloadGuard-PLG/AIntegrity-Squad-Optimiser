import fs from 'node:fs';
import path from 'node:path';

const runsDir=path.resolve(process.argv[2] ?? 'calibration/resource-coach-log/runs');
const outDir=path.resolve(process.argv[3] ?? 'calibration/resource-coach-log/generated');
const EXPECTED_SCHEMA='resource-coach-experiment-v1';

function die(message){console.error(message);process.exit(1);}
function q(v){if(v===null||v===undefined)return '';const s=typeof v==='object'?JSON.stringify(v):String(v);return /[",\n\r]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
function csv(headers,rows){return [headers.map(q).join(','),...rows.map(r=>headers.map(h=>q(r[h])).join(','))].join('\n')+'\n';}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
function write(name,headers,rows){fs.writeFileSync(path.join(outDir,name),csv(headers,rows));}

if(!fs.existsSync(runsDir))die(`Runs directory does not exist: ${runsDir}`);
fs.mkdirSync(outDir,{recursive:true});
const files=fs.readdirSync(runsDir).filter(f=>f.endsWith('.json')).sort();
const records=[],ids=new Set();
for(const file of files){
  const rec=JSON.parse(fs.readFileSync(path.join(runsDir,file),'utf8'));
  if(rec.schemaVersion!==EXPECTED_SCHEMA)die(`${file}: unsupported schemaVersion ${rec.schemaVersion}`);
  const id=rec.experiment?.experimentId;
  if(!id)die(`${file}: missing experiment.experimentId`);
  if(file!==`${id}.json`)die(`${file}: filename must equal <experimentId>.json`);
  if(ids.has(id))die(`${file}: duplicate experimentId ${id}`);
  ids.add(id);records.push({file,rec});
}
for(const {file,rec} of records){
  const e=rec.experiment??{},o=rec.observation;
  if(e.status==='observed'&&!o)die(`${file}: observed experiment lacks observation`);
  const observedAt=Date.parse(e.observedAt??o?.capturedAt??'');
  if(e.status==='observed'&&!Number.isFinite(observedAt))die(`${file}: invalid observedAt`);
  for(const p of rec.predictions??[]){
    const t=Date.parse(p.capturedAt??'');
    if(!Number.isFinite(t)||t>=observedAt)die(`${file}: prediction ${p.predictionId??'<unknown>'} is not pre-outcome`);
  }
  if(rec.evidence?.isDuplicate){
    const parent=rec.evidence.duplicateOfExperimentId;
    if(!parent||parent===e.experimentId||!ids.has(parent))die(`${file}: invalid duplicateOfExperimentId`);
  }
}

const experiments=[],observed=[],predictions=[],predictedStats=[],scores=[],residuals=[],partitions=[];
const modelSet=new Map();
for(const {file,rec} of records){
  const e=rec.experiment,input=e.input??rec.observation?.input??{},ev=rec.evidence??{},fitWeight=ev.isDuplicate?0:1;
  experiments.push({experiment_id:e.experimentId,player_id:e.playerId??input.playerId??'',created_at:e.createdAt??'',partition:e.partition??'',origin_partition:e.originPartition??'',current_partition:e.currentPartition??e.partition??'',promoted_at:e.promotedAt??'',status:e.status??'',observed_at:e.observedAt??'',evidence_fingerprint:ev.fingerprint??'',is_duplicate:!!ev.isDuplicate,duplicate_of_experiment_id:ev.duplicateOfExperimentId??'',evidence_detected_at:ev.detectedAt??'',player_age:input.age??'',tier:input.tier??'',state_key:input.stateKey??'',source_family:input.sourceFamily??'',source_family_source:input.sourceFamilySource??'',transfer_class:input.transferClass??'',transfer_class_source:input.transferClassSource??'',coach_label:input.coachLabel??'',displayed_multiplier:input.multiplier??'',programme_family:input.programmeFamily??'unknown',programme_family_source:input.programmeFamilySource??'',target_source:input.targetSource??'',affected_stat_count:(input.stats??[]).length,fit_weight:fitWeight,source_file:file});
  for(const pe of e.partitionHistory??[])partitions.push({experiment_id:e.experimentId,event_seq:pe.eventSeq??'',recorded_at:pe.recordedAt??'',event_kind:pe.eventKind??'',from_partition:pe.fromPartition??'',to_partition:pe.toPartition??'',note:pe.note??''});
  const statMap=new Map((input.stats??[]).map(s=>[s.stat,s]));
  const o=rec.observation;
  for(const r of o?.intervals??[]){const s=statMap.get(r.stat)??{};observed.push({experiment_id:e.experimentId,player_id:e.playerId??input.playerId??'',observed_at:o.capturedAt??e.observedAt??'',transfer_class:input.transferClass??'',transfer_class_source:input.transferClassSource??'',coach_label:input.coachLabel??'',programme_family:input.programmeFamily??'unknown',displayed_multiplier:input.multiplier??'',affected_stat_count:(input.stats??[]).length,player_age:input.age??'',tier:input.tier??'',stat:r.stat,displayed_stat:s.displayedStat??'',display_class:s.displayClass??'',gain_lo:r.gainLo,gain_hi:r.gainHi,evidence_kind:o.evidenceKind??'',evidence_source:o.source??'',target_source:input.targetSource??'',source_family_source:input.sourceFamilySource??'',programme_family_source:input.programmeFamilySource??'',fit_weight:fitWeight});}
  const predByModel=new Map();
  for(const p of rec.predictions??[]){
    const pv=p.prediction??{},pi=p.input??input,mv=p.modelVersion??pv.modelVersion??'';
    if(mv)predByModel.set(mv,p.predictionId??'');
    if(mv&&!modelSet.has(mv))modelSet.set(mv,{model_version:mv,status:pv.status??'',first_seen:p.capturedAt??'',source_file:file});
    predictions.push({experiment_id:e.experimentId,prediction_id:p.predictionId??'',model_version:mv,captured_at:p.capturedAt??'',prediction_status:pv.status??'',mode:pv.mode??'',reason_summary:(pv.reasons??[]).join(' | '),ovr_pred_lo:pv.ovrBoost?.gainLo??'',ovr_pred_hi:pv.ovrBoost?.gainHi??'',player_id:pi.playerId??'',age:pi.age??'',tier:pi.tier??'',state_key:pi.stateKey??'',coach_label:pi.coachLabel??'',multiplier:pi.multiplier??'',programme_family:pi.programmeFamily??'unknown',transfer_class:pi.transferClass??'',fit_weight:fitWeight});
    for(const r of pv.intervals??[])predictedStats.push({experiment_id:e.experimentId,prediction_id:p.predictionId??'',model_version:mv,stat:r.stat,predicted_lo:r.gainLo,predicted_hi:r.gainHi,fit_weight:fitWeight});
  }
  for(const s of rec.scores??[])scores.push({experiment_id:e.experimentId,prediction_id:predByModel.get(s?.modelVersion??'')??'',model_version:s?.modelVersion??'',scored_at:e.observedAt??'',status:s?.status??'',matched_stat_count:s?.matchedStatCount??'',endpoint_mae:s?.endpointMae??'',midpoint_mae:s?.midpointMae??'',mean_interval_iou:s?.meanIntervalIou??'',ovr_endpoint_abs_error:s?.ovrResidual?.endpointAbsError??'',ovr_midpoint_error:s?.ovrResidual?.midpointError??'',fit_weight:fitWeight,reason:s?.reason??''});
  for(const r of rec.residuals??[])residuals.push({experiment_id:e.experimentId,prediction_id:r.prediction_id??'',model_version:r.model_version??'',stat:r.stat??'',predicted_lo:r.predicted_lo,predicted_hi:r.predicted_hi,observed_lo:r.observed_lo,observed_hi:r.observed_hi,low_error:r.low_error,high_error:r.high_error,endpoint_abs_error:r.endpoint_abs_error,midpoint_error:r.midpoint_error,width_error:r.width_error,interval_iou:r.interval_iou,fit_weight:fitWeight});
}
const headers={
 experiments:['experiment_id','player_id','created_at','partition','origin_partition','current_partition','promoted_at','status','observed_at','evidence_fingerprint','is_duplicate','duplicate_of_experiment_id','evidence_detected_at','player_age','tier','state_key','source_family','source_family_source','transfer_class','transfer_class_source','coach_label','displayed_multiplier','programme_family','programme_family_source','target_source','affected_stat_count','fit_weight','source_file'],
 observed:['experiment_id','player_id','observed_at','transfer_class','transfer_class_source','coach_label','programme_family','displayed_multiplier','affected_stat_count','player_age','tier','stat','displayed_stat','display_class','gain_lo','gain_hi','evidence_kind','evidence_source','target_source','source_family_source','programme_family_source','fit_weight'],
 predictions:['experiment_id','prediction_id','model_version','captured_at','prediction_status','mode','reason_summary','ovr_pred_lo','ovr_pred_hi','player_id','age','tier','state_key','coach_label','multiplier','programme_family','transfer_class','fit_weight'],
 predictedStats:['experiment_id','prediction_id','model_version','stat','predicted_lo','predicted_hi','fit_weight'],
 scores:['experiment_id','prediction_id','model_version','scored_at','status','matched_stat_count','endpoint_mae','midpoint_mae','mean_interval_iou','ovr_endpoint_abs_error','ovr_midpoint_error','fit_weight','reason'],
 residuals:['experiment_id','prediction_id','model_version','stat','predicted_lo','predicted_hi','observed_lo','observed_hi','low_error','high_error','endpoint_abs_error','midpoint_error','width_error','interval_iou','fit_weight'],
 partitions:['experiment_id','event_seq','recorded_at','event_kind','from_partition','to_partition','note']
};
write('experiments.csv',headers.experiments,experiments);write('observed_stats.csv',headers.observed,observed);write('predictions.csv',headers.predictions,predictions);write('predicted_stats.csv',headers.predictedStats,predictedStats);write('scores.csv',headers.scores,scores);write('residuals.csv',headers.residuals,residuals);write('partition_history.csv',headers.partitions,partitions);write('model_registry.csv',['model_version','status','first_seen','source_file'],[...modelSet.values()].sort((a,b)=>a.model_version.localeCompare(b.model_version)));
const modelSummary={};
for(const s of scores){const mv=s.model_version||'unknown';modelSummary[mv]??={all_rows:0,fit_rows:0,endpoint:[],midpoint:[],iou:[]};const m=modelSummary[mv];m.all_rows++;if(s.fit_weight===1){m.fit_rows++;if(finite(s.endpoint_mae))m.endpoint.push(s.endpoint_mae);if(finite(s.midpoint_mae))m.midpoint.push(s.midpoint_mae);if(finite(s.mean_interval_iou))m.iou.push(s.mean_interval_iou);}}
for(const m of Object.values(modelSummary)){m.endpoint_mae=mean(m.endpoint);m.midpoint_mae=mean(m.midpoint);m.mean_interval_iou=mean(m.iou);delete m.endpoint;delete m.midpoint;delete m.iou;}
const sourceTimes=experiments.map(e=>Date.parse(e.observed_at||e.created_at||'')).filter(Number.isFinite);
const generatedAt=sourceTimes.length?new Date(Math.max(...sourceTimes)).toISOString():null;
const summary={schemaVersion:'resource-coach-log-summary-v1',generatedAt,sourceFiles:files.length,experimentRecords:experiments.length,observedExperiments:experiments.filter(e=>e.status==='observed').length,exactDuplicateRecords:experiments.filter(e=>e.is_duplicate).length,uniqueEvidenceRecords:experiments.filter(e=>!e.is_duplicate).length,observedStatRows:observed.length,predictionRows:predictions.length,scoreRows:scores.length,residualRows:residuals.length,models:modelSummary};
fs.writeFileSync(path.join(outDir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
