import type { GainInterval, ResourceObservation } from './resourceCoachV2';

export type ExperimentPartition =
  | 'prospective-holdout'
  | 'retrospective'
  | 'calibration'
  | 'excluded';

export type ScorablePrediction = {
  modelVersion: string;
  status: 'predicted' | 'unavailable';
  intervals: GainInterval[];
  ovrBoost?: { gainLo: number; gainHi: number };
  reasons?: string[];
};

export type IntervalResidual = {
  stat: string;
  predictedLo: number;
  predictedHi: number;
  observedLo: number;
  observedHi: number;
  lowError: number;
  highError: number;
  endpointAbsError: number;
  midpointError: number;
  widthError: number;
  intervalIou: number;
};

export type PredictionScore = {
  modelVersion: string;
  status: 'scored' | 'partial' | 'unscored';
  matchedStatCount: number;
  endpointMae: number | null;
  midpointMae: number | null;
  meanIntervalIou: number | null;
  residuals: IntervalResidual[];
  ovrResidual?: IntervalResidual;
  reason?: string;
};

function intervalResidual(
  stat: string,
  predicted: { gainLo: number; gainHi: number },
  observed: { gainLo: number; gainHi: number },
): IntervalResidual {
  const lowError = predicted.gainLo - observed.gainLo;
  const highError = predicted.gainHi - observed.gainHi;
  const predictedMid = (predicted.gainLo + predicted.gainHi) / 2;
  const observedMid = (observed.gainLo + observed.gainHi) / 2;
  const overlap = Math.max(0, Math.min(predicted.gainHi, observed.gainHi) - Math.max(predicted.gainLo, observed.gainLo));
  const union = Math.max(predicted.gainHi, observed.gainHi) - Math.min(predicted.gainLo, observed.gainLo);
  return {
    stat,
    predictedLo: predicted.gainLo,
    predictedHi: predicted.gainHi,
    observedLo: observed.gainLo,
    observedHi: observed.gainHi,
    lowError,
    highError,
    endpointAbsError: (Math.abs(lowError) + Math.abs(highError)) / 2,
    midpointError: predictedMid - observedMid,
    widthError: (predicted.gainHi - predicted.gainLo) - (observed.gainHi - observed.gainLo),
    intervalIou: union === 0 ? 1 : overlap / union,
  };
}

export function scorePrediction(
  prediction: ScorablePrediction,
  observation: ResourceObservation,
): PredictionScore {
  if (prediction.status !== 'predicted') {
    return {
      modelVersion: prediction.modelVersion,
      status: 'unscored',
      matchedStatCount: 0,
      endpointMae: null,
      midpointMae: null,
      meanIntervalIou: null,
      residuals: [],
      reason: prediction.reasons?.at(-1) ?? 'Prediction was unavailable before the observed preview.',
    };
  }

  const predictedByStat = new Map(prediction.intervals.map(r => [r.stat, r]));
  const residuals = observation.intervals.flatMap(observed => {
    const predicted = predictedByStat.get(observed.stat);
    return predicted ? [intervalResidual(observed.stat, predicted, observed)] : [];
  });
  if (!residuals.length) {
    return {
      modelVersion: prediction.modelVersion,
      status: 'unscored',
      matchedStatCount: 0,
      endpointMae: null,
      midpointMae: null,
      meanIntervalIou: null,
      residuals: [],
      reason: 'No predicted stat interval matched an observed stat interval.',
    };
  }

  const complete = residuals.length === observation.intervals.length;
  const n = residuals.length;
  const ovrResidual = prediction.ovrBoost && observation.ovrBoost
    ? intervalResidual('__OVR__', prediction.ovrBoost, observation.ovrBoost)
    : undefined;
  return {
    modelVersion: prediction.modelVersion,
    status: complete ? 'scored' : 'partial',
    matchedStatCount: n,
    endpointMae: residuals.reduce((sum, r) => sum + r.endpointAbsError, 0) / n,
    midpointMae: residuals.reduce((sum, r) => sum + Math.abs(r.midpointError), 0) / n,
    meanIntervalIou: residuals.reduce((sum, r) => sum + r.intervalIou, 0) / n,
    residuals,
    ...(ovrResidual ? { ovrResidual } : {}),
    ...(!complete ? { reason: `Only ${n}/${observation.intervals.length} observed stats had a matching pre-outcome prediction.` } : {}),
  };
}
