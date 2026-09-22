import { RESOURCE_MODEL, validateObservation, type ResourceInput, type ResourceObservation, type ResourcePrediction, type PlayerCalibration } from '../logic/resourceCoachV2';
import type { CandidatePrediction } from '../logic/resourceCoachCandidate';
import { scorePrediction, type ExperimentPartition, type PredictionScore, type ScorablePrediction } from '../logic/resourceCoachExperiment';

const key = 'resource-coach-v2-evidence';
type PredictionRecord = {id:string;experimentId:string;input:ResourceInput;prediction:ResourcePrediction|CandidatePrediction;capturedAt:string};
type ExperimentRecord = {id:string;playerId:string;createdAt:string;input:ResourceInput;partition:ExperimentPartition;status:'open'|'observed';observedAt?:string};
type Store = {
  predictions: PredictionRecord[];
  observations: ResourceObservation[];
  calibrations: PlayerCalibration[];
  experiments: ExperimentRecord[];
  scores: {experimentId:string;predictionId:string;score:PredictionScore}[];
};
function read(): Store {
  const raw=JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Store>;
  return {
    predictions:(raw.predictions ?? []).map((p:any)=>({...p,experimentId:p.experimentId ?? p.id,capturedAt:p.capturedAt ?? new Date(0).toISOString()})),
    observations:raw.observations ?? [],
    calibrations:raw.calibrations ?? [],
    experiments:raw.experiments ?? [],
    scores:raw.scores ?? [],
  };
}
function write(s: Store) { localStorage.setItem(key, JSON.stringify(s)); }
function signature(input:ResourceInput) {
  return JSON.stringify({playerId:input.playerId,age:input.age,tier:input.tier,stateKey:input.stateKey,
    sourceFamily:input.sourceFamily,transferClass:input.transferClass,coachLabel:input.coachLabel,multiplier:input.multiplier,
    programmeFamily:input.programmeFamily ?? 'unknown',
    stats:input.stats.map(({stat,displayedStat,displayClass})=>({stat,displayedStat,displayClass})).sort((a,b)=>a.stat.localeCompare(b.stat))});
}
function ensureExperiment(s:Store,id:string,input:ResourceInput,partition:ExperimentPartition) {
  const existing=s.experiments.find(e=>e.id===id);
  if(existing) {
    if(signature(existing.input)!==signature(input)) throw Error('Experiment input changed after capture began. Start a new isolated experiment.');
    return existing;
  }
  const next:ExperimentRecord={id,playerId:input.playerId,createdAt:new Date().toISOString(),input,partition,status:'open'};
  s.experiments.push(next);return next;
}
function savePredictionRecord(s:Store,experimentId:string,id:string,input:ResourceInput,prediction:ResourcePrediction|CandidatePrediction,partition:ExperimentPartition) {
  const experiment=ensureExperiment(s,experimentId,input,partition);
  if(experiment.status!=='open') throw Error('Observed outcome is already saved. Start a new experiment before projecting again.');
  if(s.predictions.some(p=>p.experimentId===experimentId&&p.prediction.modelVersion===prediction.modelVersion)) throw Error('That model already has a frozen prediction in this experiment.');
  s.predictions.push({id,experimentId,input,prediction,capturedAt:new Date().toISOString()});
}
export const resourceCoachService = {
  calibration(id:string) { return read().calibrations.filter(c => c.playerId===id && c.modelVersion===RESOURCE_MODEL.modelVersion).at(-1) ?? null; },
  savePrediction(experimentId:string,id:string,input:ResourceInput,prediction:ResourcePrediction,partition:ExperimentPartition='prospective-holdout') {
    const s=read();savePredictionRecord(s,experimentId,id,input,prediction,partition);write(s);
  },
  saveCandidatePrediction(experimentId:string,id:string,input:ResourceInput,prediction:CandidatePrediction,partition:ExperimentPartition='prospective-holdout') {
    const s=read();savePredictionRecord(s,experimentId,id,input,prediction,partition);write(s);
  },
  saveObservation(o:ResourceObservation,partition:ExperimentPartition='prospective-holdout'):PredictionScore[] {
    validateObservation(o);const s=read();const experiment=ensureExperiment(s,o.id,o.input,partition);
    if(experiment.status!=='open'||s.observations.some(r=>r.id===o.id))throw Error('Observation already saved for this experiment.');
    s.observations.push(o);experiment.status='observed';experiment.observedAt=o.capturedAt;
    const scores=s.predictions.filter(p=>p.experimentId===o.id).map(p=>({predictionId:p.id,score:scorePrediction(p.prediction as ScorablePrediction,o)}));
    s.scores.push(...scores.map(x=>({experimentId:o.id,predictionId:x.predictionId,score:x.score})));write(s);return scores.map(x=>x.score);
  },
  saveCalibration(c:PlayerCalibration,o:ResourceObservation) {
    const s=read();const experiment=s.experiments.find(e=>e.id===o.id);
    if(!experiment||experiment.partition!=='calibration')throw Error('Promote the saved observation to the calibration corpus before fitting an anchor.');
    if(!s.observations.some(r=>r.id===c.anchorId&&r.id===o.id))throw Error('Save the anchor first.');
    s.calibrations.push(c);write(s);
  },
  setExperimentPartition(id:string,partition:ExperimentPartition) {
    const s=read();const e=s.experiments.find(x=>x.id===id);if(!e)throw Error('Experiment has not been persisted yet.');
    if(partition==='calibration'&&e.status!=='observed')throw Error('Only a saved observed experiment can enter the calibration corpus.');
    e.partition=partition;write(s);return partition;
  },
  getExperimentScores(id:string) { return read().scores.filter(x=>x.experimentId===id).map(x=>x.score); },
  exportExperiment(id:string) {
    const s=read();const e=s.experiments.find(x=>x.id===id);if(!e)throw Error('This experiment has not been persisted yet. Project or save the observation first.');
    return JSON.stringify({schemaVersion:'resource-coach-experiment-v1',experiment:e,
      observation:s.observations.find(o=>o.id===id)??null,
      predictions:s.predictions.filter(p=>p.experimentId===id),
      scores:s.scores.filter(x=>x.experimentId===id)},null,2);
  },
  exportPlayer(id:string) {
    const s=read();return JSON.stringify({schemaVersion:'resource-coach-player-corpus-v1',model:RESOURCE_MODEL,
      experiments:s.experiments.filter(e=>e.playerId===id).map(e=>({
        experiment:e,observation:s.observations.find(o=>o.id===e.id)??null,
        predictions:s.predictions.filter(p=>p.experimentId===e.id),scores:s.scores.filter(x=>x.experimentId===e.id)})),
      calibrations:s.calibrations.filter(c=>c.playerId===id)},null,2);
  },
  exportCalibrationCorpus() {
    const s=read();return JSON.stringify({schemaVersion:'resource-coach-calibration-corpus-v1',
      experiments:s.experiments.filter(e=>e.partition==='calibration'&&e.status==='observed').map(e=>({
        experiment:e,observation:s.observations.find(o=>o.id===e.id)??null,
        predictions:s.predictions.filter(p=>p.experimentId===e.id),scores:s.scores.filter(x=>x.experimentId===e.id)}))},null,2);
  },
};
