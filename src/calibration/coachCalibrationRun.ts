import type {
  CoachCalibrationCorpus,
  CoachCalibrationExperiment,
  ScoredExperiment,
} from './coachCalibrationTypes';
import { runProductionCoachPrediction } from './coachEngineAdapter';
import { scoreExperiment } from './coachCalibrationScore';
import { validateCorpus } from './coachCalibrationValidate';

export function runExperiment(experiment: CoachCalibrationExperiment): ScoredExperiment {
  const prediction = runProductionCoachPrediction(experiment.id, experiment.preOutcome);
  return scoreExperiment(experiment, prediction);
}

export function runCorpus(corpus: CoachCalibrationCorpus): ScoredExperiment[] {
  const errors = validateCorpus(corpus);
  if (errors.length > 0) {
    throw new Error(`Invalid coach calibration corpus:\n${errors.map(error => `- ${error}`).join('\n')}`);
  }
  return corpus.experiments.map(runExperiment);
}
