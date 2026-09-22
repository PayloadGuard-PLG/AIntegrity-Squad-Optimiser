import { RESOURCE_COACH_SCHEMA } from '../db/resourceCoachSchema';
import { RESOURCE_MODEL, validateObservation, type ResourceInput, type ResourceObservation, type ResourcePrediction, type PlayerCalibration } from '../logic/resourceCoachV2';
import { RESOURCE_CALIBRATION_CANDIDATE, type CandidatePrediction } from '../logic/resourceCoachCandidate';
import { scorePrediction, type ExperimentPartition, type PredictionScore, type ScorablePrediction } from '../logic/resourceCoachExperiment';

export interface ResourceDatabase {
  execSync(sql: string): void;
  runSync(sql: string, params: (string | number | null)[]): unknown;
  getFirstSync<T = Record<string, unknown>>(sql: string, params: (string | number | null)[]): T | null;
  getAllSync<T = Record<string, unknown>>(sql: string, params: (string | number | null)[]): T[];
  withTransactionSync(action: () => void): void;
}

type ExperimentRow = {
  experiment_id: string;
  player_id: string;
  created_at: string;
  input_json: string;
  partition: ExperimentPartition;
  status: 'open' | 'observed';
  observed_at: string | null;
};

function experimentSignature(input: ResourceInput): string {
  return JSON.stringify({
    playerId: input.playerId,
    age: input.age,
    tier: input.tier,
    stateKey: input.stateKey,
    sourceFamily: input.sourceFamily,
    transferClass: input.transferClass,
    coachLabel: input.coachLabel,
    multiplier: input.multiplier,
    programmeFamily: input.programmeFamily ?? 'unknown',
    stats: input.stats
      .map(({stat,displayedStat,displayClass}) => ({stat,displayedStat,displayClass}))
      .sort((a,b) => a.stat.localeCompare(b.stat)),
  });
}

export function createResourceCoachStore(expoDb: ResourceDatabase) {
let ready = false;
function ensure() {
  if (ready) return;
  expoDb.withTransactionSync(() => {
    expoDb.execSync(RESOURCE_COACH_SCHEMA);
    expoDb.runSync('UPDATE resource_coach_model_versions SET active = 0 WHERE active = 1', []);
    expoDb.runSync(`INSERT INTO resource_coach_model_versions
      (model_version,created_at,transfer_class,parameter_json,validation_json,source_corpus_hash,active)
      VALUES (?,?,'ordinary',?,?,?,1) ON CONFLICT(model_version) DO UPDATE SET active=1`,
      [RESOURCE_MODEL.modelVersion,new Date().toISOString(),JSON.stringify(RESOURCE_MODEL),JSON.stringify(RESOURCE_MODEL.validation),null]);
    expoDb.runSync(`INSERT INTO resource_coach_model_versions
      (model_version,created_at,transfer_class,parameter_json,validation_json,source_corpus_hash,active)
      VALUES (?,?,'ordinary',?,?,?,0) ON CONFLICT(model_version) DO NOTHING`,
      [RESOURCE_CALIBRATION_CANDIDATE.modelVersion,new Date().toISOString(),JSON.stringify(RESOURCE_CALIBRATION_CANDIDATE),
       JSON.stringify(RESOURCE_CALIBRATION_CANDIDATE.evidence),null]);
  });
  ready = true;
}
function getExperiment(id: string): ExperimentRow | null {
  return expoDb.getFirstSync<ExperimentRow>('SELECT * FROM resource_coach_experiment WHERE experiment_id=?',[id]);
}
function ensureExperiment(id: string, input: ResourceInput, initialPartition: ExperimentPartition): ExperimentRow {
  ensure();
  const existing = getExperiment(id);
  if (existing) {
    const original = JSON.parse(existing.input_json) as ResourceInput;
    if (experimentSignature(original) !== experimentSignature(input)) {
      throw Error('Experiment input changed after capture began. Start a new isolated experiment.');
    }
    return existing;
  }
  const createdAt = new Date().toISOString();
  expoDb.runSync(`INSERT INTO resource_coach_experiment
    (experiment_id,player_id,created_at,input_json,partition,status,observed_at)
    VALUES (?,?,?,?,?,'open',NULL)`,
    [id,input.playerId,createdAt,JSON.stringify(input),initialPartition]);
  return getExperiment(id)!;
}
function persistScore(experimentId: string, predictionId: string, score: PredictionScore) {
  const scoredAt = new Date().toISOString();
  expoDb.runSync(`INSERT OR REPLACE INTO resource_coach_prediction_score
    (experiment_id,prediction_id,model_version,scored_at,status,matched_stat_count,endpoint_mae,midpoint_mae,mean_interval_iou,score_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [experimentId,predictionId,score.modelVersion,scoredAt,score.status,score.matchedStatCount,
     score.endpointMae,score.midpointMae,score.meanIntervalIou,JSON.stringify(score)]);
  for (const r of score.residuals) {
    expoDb.runSync(`INSERT OR REPLACE INTO resource_coach_residual
      (experiment_id,prediction_id,model_version,stat,predicted_lo,predicted_hi,observed_lo,observed_hi,
       low_error,high_error,endpoint_abs_error,midpoint_error,width_error,interval_iou)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [experimentId,predictionId,score.modelVersion,r.stat,r.predictedLo,r.predictedHi,r.observedLo,r.observedHi,
       r.lowError,r.highError,r.endpointAbsError,r.midpointError,r.widthError,r.intervalIou]);
  }
}
function savePredictionRecord(
  experimentId: string,
  predictionId: string,
  input: ResourceInput,
  prediction: ResourcePrediction | CandidatePrediction,
  initialPartition: ExperimentPartition,
) {
  ensureExperiment(experimentId,input,initialPartition);
  const experiment = getExperiment(experimentId)!;
  if (experiment.status !== 'open') throw Error('Observed outcome is already saved. Start a new experiment before projecting again.');
  const now = new Date().toISOString();
  expoDb.withTransactionSync(() => {
    expoDb.runSync('INSERT INTO resource_coach_prediction VALUES (?,?,?,?,?,?)',
      [predictionId,input.playerId,prediction.modelVersion,now,JSON.stringify(input),JSON.stringify(prediction)]);
    expoDb.runSync(`INSERT INTO resource_coach_experiment_prediction
      (experiment_id,prediction_id,model_version,created_at) VALUES (?,?,?,?)`,
      [experimentId,predictionId,prediction.modelVersion,now]);
  });
}
function parseJson<T>(value: unknown): T | null {
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}
return {
  calibration(playerId: string): PlayerCalibration | null {
    ensure();
    const row = expoDb.getFirstSync<{calibration_json:string}>(
      'SELECT calibration_json FROM resource_coach_player_calibration WHERE player_id=? AND model_version=? AND is_active=1 ORDER BY captured_at DESC LIMIT 1',
      [playerId,RESOURCE_MODEL.modelVersion]);
    return row ? JSON.parse(row.calibration_json) : null;
  },
  savePrediction(experimentId: string, id: string, input: ResourceInput, prediction: ResourcePrediction, initialPartition: ExperimentPartition = 'prospective-holdout') {
    savePredictionRecord(experimentId,id,input,prediction,initialPartition);
  },
  saveCandidatePrediction(experimentId: string, id: string, input: ResourceInput, prediction: CandidatePrediction, initialPartition: ExperimentPartition = 'prospective-holdout') {
    savePredictionRecord(experimentId,id,input,prediction,initialPartition);
  },
  saveObservation(o: ResourceObservation, initialPartition: ExperimentPartition = 'prospective-holdout'): PredictionScore[] {
    validateObservation(o); ensureExperiment(o.id,o.input,initialPartition);
    const experiment = getExperiment(o.id)!;
    if (experiment.status !== 'open') throw Error('Observation already saved for this experiment.');
    const scores: PredictionScore[] = [];
    expoDb.withTransactionSync(() => {
      expoDb.runSync('INSERT INTO resource_coach_preview VALUES (?,?,?,?)',[o.id,o.input.playerId,JSON.stringify(o.input),JSON.stringify(o)]);
      for (const r of o.intervals) {
        const s = o.input.stats.find(s => s.stat === r.stat)!;
        expoDb.runSync(`INSERT INTO resource_coach_observation
          (observation_id,player_id,player_state_id,observed_at,transfer_class,transfer_class_source,coach_label,coach_family,
           displayed_multiplier,affected_stat_count,player_age,tier,stat,displayed_stat,display_class,gain_lo,gain_hi,evidence_kind,source_ref)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'observed-interval',?)`,
          [o.id,o.input.playerId,o.input.stateKey,o.capturedAt,o.input.transferClass,o.input.transferClassSource ?? 'unresolved',o.input.coachLabel,
           o.input.programmeFamily ?? null,o.input.multiplier,o.input.stats.length,o.input.age,o.input.tier,r.stat,s.displayedStat,s.displayClass,r.gainLo,r.gainHi,
           JSON.stringify({
             evidenceSource:o.source,
             targetSource:o.input.targetSource ?? 'unresolved',
             sourceFamilySource:o.input.sourceFamilySource ?? 'unresolved',
             programmeFamilySource:o.input.programmeFamilySource ?? 'unresolved',
           })]);
      }
      if (o.ovrBoost) expoDb.runSync('INSERT INTO resource_coach_ovr_observation VALUES (?,?,?,?)',
        [o.id,o.ovrBoost.gainLo,o.ovrBoost.gainHi,'observed-boost-interval']);

      const predictions = expoDb.getAllSync<{prediction_id:string;prediction_json:string}>(`
        SELECT ep.prediction_id,p.prediction_json
        FROM resource_coach_experiment_prediction ep
        JOIN resource_coach_prediction p ON p.prediction_id=ep.prediction_id
        WHERE ep.experiment_id=? ORDER BY ep.created_at ASC`,[o.id]);
      for (const row of predictions) {
        const prediction = JSON.parse(row.prediction_json) as ScorablePrediction;
        const score = scorePrediction(prediction,o);
        persistScore(o.id,row.prediction_id,score);
        scores.push(score);
      }
      expoDb.runSync(`UPDATE resource_coach_experiment SET status='observed',observed_at=? WHERE experiment_id=?`,
        [o.capturedAt,o.id]);
    });
    return scores;
  },
  saveCalibration(c: PlayerCalibration, o: ResourceObservation) {
    ensure();
    const experiment = getExperiment(o.id);
    if (!experiment || experiment.partition !== 'calibration') {
      throw Error('Promote the saved observation to the calibration corpus before fitting an anchor.');
    }
    if (c.anchorId !== o.id || !expoDb.getFirstSync('SELECT observation_id FROM resource_coach_preview WHERE observation_id=?',[o.id])) throw Error('Save the separate anchor observation first.');
    expoDb.withTransactionSync(() => {
      expoDb.runSync('UPDATE resource_coach_player_calibration SET is_active=0 WHERE player_id=?',[c.playerId]);
      expoDb.runSync(`INSERT OR REPLACE INTO resource_coach_player_calibration
        (player_id,model_version,calibration_json,age_at_anchor,tier_at_anchor,log_high_rate_offset,log_low_rate_offset,
         regularization_penalty,anchor_observation_id,anchor_coach_label,anchor_multiplier,anchor_affected_stat_count,
         evidence_kind,captured_at,valid_for_age,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'separate-observed-anchor',?,?,1)`,
        [c.playerId,c.modelVersion,JSON.stringify(c),c.age,c.tier,c.logHigh,c.logLow,c.penalty,c.anchorId,o.input.coachLabel,
         o.input.multiplier,o.input.stats.length,c.capturedAt,c.age]);
    });
  },
  setExperimentPartition(experimentId: string, partition: ExperimentPartition): ExperimentPartition {
    ensure();
    const experiment = getExperiment(experimentId);
    if (!experiment) throw Error('Experiment has not been persisted yet.');
    if (partition === 'calibration' && experiment.status !== 'observed') throw Error('Only a saved observed experiment can enter the calibration corpus.');
    expoDb.runSync('UPDATE resource_coach_experiment SET partition=? WHERE experiment_id=?',[partition,experimentId]);
    return partition;
  },
  getExperimentScores(experimentId: string): PredictionScore[] {
    ensure();
    return expoDb.getAllSync<{score_json:string}>(
      'SELECT score_json FROM resource_coach_prediction_score WHERE experiment_id=? ORDER BY scored_at ASC',[experimentId]
    ).map(r => JSON.parse(r.score_json) as PredictionScore);
  },
  exportExperiment(experimentId: string): string {
    ensure();
    const experiment = getExperiment(experimentId);
    if (!experiment) throw Error('This experiment has not been persisted yet. Project or save the observation first.');
    const preview = expoDb.getFirstSync<Record<string,unknown>>('SELECT * FROM resource_coach_preview WHERE observation_id=?',[experimentId]);
    const observedStats = expoDb.getAllSync<Record<string,unknown>>(
      'SELECT * FROM resource_coach_observation WHERE observation_id=? ORDER BY stat',[experimentId]);
    const ovr = expoDb.getFirstSync<Record<string,unknown>>('SELECT * FROM resource_coach_ovr_observation WHERE observation_id=?',[experimentId]);
    const predictions = expoDb.getAllSync<Record<string,unknown>>(`
      SELECT ep.prediction_id,ep.model_version,ep.created_at,p.input_json,p.prediction_json
      FROM resource_coach_experiment_prediction ep
      JOIN resource_coach_prediction p ON p.prediction_id=ep.prediction_id
      WHERE ep.experiment_id=? ORDER BY ep.created_at ASC`,[experimentId]);
    const scores = expoDb.getAllSync<Record<string,unknown>>(
      'SELECT * FROM resource_coach_prediction_score WHERE experiment_id=? ORDER BY scored_at ASC',[experimentId]);
    const residuals = expoDb.getAllSync<Record<string,unknown>>(
      'SELECT * FROM resource_coach_residual WHERE experiment_id=? ORDER BY model_version,stat',[experimentId]);
    return JSON.stringify({
      schemaVersion:'resource-coach-experiment-v1',
      experiment:{
        experimentId:experiment.experiment_id,playerId:experiment.player_id,createdAt:experiment.created_at,
        partition:experiment.partition,status:experiment.status,observedAt:experiment.observed_at,
        input:JSON.parse(experiment.input_json),
      },
      observation: preview ? parseJson(preview.observation_json) : null,
      observedStats: observedStats.map(r=>({...r,source_ref:parseJson(r.source_ref)})),
      ovrObservation: ovr,
      predictions: predictions.map(r=>({
        predictionId:r.prediction_id,modelVersion:r.model_version,capturedAt:r.created_at,
        input:parseJson(r.input_json),prediction:parseJson(r.prediction_json),
      })),
      scores: scores.map(r=>parseJson(r.score_json)),
      residuals,
    },null,2);
  },
  exportPlayer(playerId: string): string {
    ensure();
    const ids = expoDb.getAllSync<{experiment_id:string}>(
      'SELECT experiment_id FROM resource_coach_experiment WHERE player_id=? ORDER BY created_at ASC',[playerId]);
    const experiments = ids.map(r => JSON.parse(this.exportExperiment(r.experiment_id)));
    const legacyObservations = expoDb.getAllSync<Record<string,unknown>>(`
      SELECT p.* FROM resource_coach_preview p
      WHERE p.player_id=? AND NOT EXISTS (
        SELECT 1 FROM resource_coach_experiment e WHERE e.experiment_id=p.observation_id
      )`,[playerId]);
    const legacyPredictions = expoDb.getAllSync<Record<string,unknown>>(`
      SELECT p.* FROM resource_coach_prediction p
      WHERE p.player_id=? AND NOT EXISTS (
        SELECT 1 FROM resource_coach_experiment_prediction ep WHERE ep.prediction_id=p.prediction_id
      )`,[playerId]);
    return JSON.stringify({
      schemaVersion:'resource-coach-player-corpus-v1',
      model:RESOURCE_MODEL,
      experiments,
      legacyUnlinked:{observations:legacyObservations,predictions:legacyPredictions},
      calibrations:expoDb.getAllSync('SELECT * FROM resource_coach_player_calibration WHERE player_id=?',[playerId]),
    },null,2);
  },
  exportCalibrationCorpus(): string {
    ensure();
    const ids = expoDb.getAllSync<{experiment_id:string}>(`
      SELECT experiment_id FROM resource_coach_experiment
      WHERE partition='calibration' AND status='observed' ORDER BY created_at ASC`,[]);
    return JSON.stringify({
      schemaVersion:'resource-coach-calibration-corpus-v1',
      experiments:ids.map(r=>JSON.parse(this.exportExperiment(r.experiment_id))),
    },null,2);
  },
};

}
