import { RESOURCE_COACH_SCHEMA } from '../db/resourceCoachSchema';
import { RESOURCE_MODEL, validateObservation, type ResourceInput, type ResourceObservation, type ResourcePrediction, type PlayerCalibration } from '../logic/resourceCoachV2';

export interface ResourceDatabase {
  execSync(sql: string): void;
  runSync(sql: string, params: (string | number | null)[]): unknown;
  getFirstSync<T = Record<string, unknown>>(sql: string, params: (string | number | null)[]): T | null;
  getAllSync<T = Record<string, unknown>>(sql: string, params: (string | number | null)[]): T[];
  withTransactionSync(action: () => void): void;
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
  });
  ready = true;
}
return {
  calibration(playerId: string): PlayerCalibration | null {
    ensure();
    const row = expoDb.getFirstSync<{calibration_json:string}>(
      'SELECT calibration_json FROM resource_coach_player_calibration WHERE player_id=? AND model_version=? AND is_active=1 ORDER BY captured_at DESC LIMIT 1',
      [playerId,RESOURCE_MODEL.modelVersion]);
    return row ? JSON.parse(row.calibration_json) : null;
  },
  savePrediction(id: string, input: ResourceInput, prediction: ResourcePrediction) {
    ensure();
    expoDb.runSync('INSERT INTO resource_coach_prediction VALUES (?,?,?,?,?,?)',
      [id,input.playerId,prediction.modelVersion,new Date().toISOString(),JSON.stringify(input),JSON.stringify(prediction)]);
  },
  saveObservation(o: ResourceObservation) {
    validateObservation(o); ensure();
    expoDb.withTransactionSync(() => {
      expoDb.runSync('INSERT INTO resource_coach_preview VALUES (?,?,?,?)',[o.id,o.input.playerId,JSON.stringify(o.input),JSON.stringify(o)]);
      for (const r of o.intervals) {
        const s = o.input.stats.find(s => s.stat === r.stat)!;
        expoDb.runSync(`INSERT INTO resource_coach_observation
          (observation_id,player_id,player_state_id,observed_at,transfer_class,transfer_class_source,coach_label,
           displayed_multiplier,affected_stat_count,player_age,tier,stat,displayed_stat,display_class,gain_lo,gain_hi,evidence_kind,source_ref)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'observed-interval',?)`,
          [o.id,o.input.playerId,o.input.stateKey,o.capturedAt,o.input.transferClass,'manual-confirmed-preview',o.input.coachLabel,
           o.input.multiplier,o.input.stats.length,o.input.age,o.input.tier,r.stat,s.displayedStat,s.displayClass,r.gainLo,r.gainHi,o.source]);
      }
      if (o.ovrBoost) expoDb.runSync('INSERT INTO resource_coach_ovr_observation VALUES (?,?,?,?)',
        [o.id,o.ovrBoost.gainLo,o.ovrBoost.gainHi,'observed-boost-interval']);
    });
  },
  saveCalibration(c: PlayerCalibration, o: ResourceObservation) {
    ensure();
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
  exportPlayer(playerId: string): string {
    ensure();
    return JSON.stringify({ model: RESOURCE_MODEL,
      predictions: expoDb.getAllSync('SELECT * FROM resource_coach_prediction WHERE player_id=?',[playerId]),
      observations: expoDb.getAllSync('SELECT * FROM resource_coach_preview WHERE player_id=?',[playerId]),
      calibrations: expoDb.getAllSync('SELECT * FROM resource_coach_player_calibration WHERE player_id=?',[playerId]),
    },null,2);
  },
};

}
