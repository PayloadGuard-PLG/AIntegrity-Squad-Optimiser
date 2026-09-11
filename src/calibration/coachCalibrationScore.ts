import type {
  CalibrationInterval,
  CoachCalibrationExperiment,
  EngineExperimentPrediction,
  PointIntervalScore,
  ScoredExperiment,
} from './coachCalibrationTypes';

export function scorePointAgainstInterval(point: number, observed: CalibrationInterval): PointIntervalScore {
  const midpoint = (observed.lo + observed.hi) / 2;
  if (point < observed.lo) {
    return {
      point,
      observed,
      relation: 'below',
      boundaryResidual: point - observed.lo,
      midpointResidual: midpoint - point,
      absoluteMidpointError: Math.abs(midpoint - point),
    };
  }
  if (point > observed.hi) {
    return {
      point,
      observed,
      relation: 'above',
      boundaryResidual: point - observed.hi,
      midpointResidual: midpoint - point,
      absoluteMidpointError: Math.abs(midpoint - point),
    };
  }
  return {
    point,
    observed,
    relation: 'inside',
    boundaryResidual: 0,
    midpointResidual: midpoint - point,
    absoluteMidpointError: Math.abs(midpoint - point),
  };
}

export function scoreExperiment(
  experiment: CoachCalibrationExperiment,
  prediction: EngineExperimentPrediction,
): ScoredExperiment {
  const statScores: ScoredExperiment['statScores'] = {};
  let ovrScore: PointIntervalScore | undefined;
  let baselineOvrDrift: number | undefined;

  if (prediction.status === 'projected') {
    for (const [stat, observed] of Object.entries(experiment.observed.statIntervals)) {
      const point = prediction.statPoints[stat] ?? 0;
      statScores[stat] = scorePointAgainstInterval(point, observed);
    }
    if (experiment.observed.ovrDelta) {
      ovrScore = scorePointAgainstInterval(prediction.ovrDelta, experiment.observed.ovrDelta);
    }
    baselineOvrDrift = Number((prediction.ovrBefore - experiment.preOutcome.player.overall).toFixed(4));
  }

  return {
    experimentId: experiment.id,
    prediction,
    statScores,
    ovrScore,
    baselineOvrDrift,
  };
}
