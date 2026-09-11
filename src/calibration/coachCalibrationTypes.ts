import type { Player } from '../database/playerSchema';
import type { CoachTransferClass } from '../logic/coachTransfer';

export interface CalibrationInterval {
  lo: number;
  hi: number;
}

export interface CalibrationCoach {
  programmeFamily: string;
  title: string;
  multiplier: number;
  durationDays?: number;
  affectedStats: string[];
  transferClass: CoachTransferClass;
}

export interface CalibrationPreOutcome {
  player: Player;
  coach: CalibrationCoach;
}

export interface ExternalFrozenPrediction {
  producer: string;
  frozenAt?: string;
  statIntervals: Record<string, CalibrationInterval>;
  ovrDelta?: CalibrationInterval;
}

export interface CalibrationObservation {
  statIntervals: Record<string, CalibrationInterval>;
  ovrDelta?: CalibrationInterval;
  stateChanged: boolean;
  source?: string;
}

export interface EngineBaselineSnapshot {
  baseCommit: string;
  profileVersion: string;
  statPoints: Record<string, number>;
  ovrBefore: number;
  ovrDelta: number;
}

export interface CoachCalibrationExperiment {
  schemaVersion: 1;
  id: string;
  tags?: string[];
  preOutcome: CalibrationPreOutcome;
  externalFrozenPrediction?: ExternalFrozenPrediction;
  observed: CalibrationObservation;
  baselineEnginePrediction?: EngineBaselineSnapshot;
}

export interface CoachCalibrationCorpus {
  schemaVersion: 1;
  baseCommit: string;
  experiments: CoachCalibrationExperiment[];
}

export interface EngineProjectedExperiment {
  experimentId: string;
  status: 'projected';
  profileVersion: string;
  statPoints: Record<string, number>;
  ovrBefore: number;
  ovrDelta: number;
}

export interface EngineUnavailableExperiment {
  experimentId: string;
  status: 'unavailable';
  profileVersion: string;
  transferClass: 'reward' | 'unresolved';
  reasonCodes: string[];
}

export type EngineExperimentPrediction = EngineProjectedExperiment | EngineUnavailableExperiment;

export interface PointIntervalScore {
  point: number;
  observed: CalibrationInterval;
  relation: 'below' | 'inside' | 'above';
  /** Signed distance from the nearest interval boundary. Inside = 0. */
  boundaryResidual: number;
  /** Observed midpoint minus predicted point. Positive means the game was higher. */
  midpointResidual: number;
  absoluteMidpointError: number;
}

export interface ScoredExperiment {
  experimentId: string;
  prediction: EngineExperimentPrediction;
  statScores: Record<string, PointIntervalScore>;
  ovrScore?: PointIntervalScore;
  baselineOvrDrift?: number;
}
