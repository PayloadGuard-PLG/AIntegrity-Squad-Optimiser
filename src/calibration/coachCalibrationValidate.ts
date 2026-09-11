import type {
  CalibrationInterval,
  CoachCalibrationCorpus,
  CoachCalibrationExperiment,
} from './coachCalibrationTypes';

function intervalError(path: string, interval: CalibrationInterval): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(interval.lo) || !Number.isFinite(interval.hi)) {
    errors.push(`${path}: interval bounds must be finite`);
  } else if (interval.hi < interval.lo) {
    errors.push(`${path}: interval is inverted (${interval.lo}..${interval.hi})`);
  }
  return errors;
}

export function validateExperiment(experiment: CoachCalibrationExperiment): string[] {
  const errors: string[] = [];
  const { preOutcome, observed } = experiment;
  const affected = preOutcome.coach.affectedStats;

  if (experiment.schemaVersion !== 1) errors.push(`${experiment.id}: unsupported schemaVersion`);
  if (!experiment.id.trim()) errors.push('experiment id is empty');
  if (!preOutcome.player.id.trim()) errors.push(`${experiment.id}: player id is empty`);
  if (!preOutcome.player.name.trim()) errors.push(`${experiment.id}: player name is empty`);
  if (!Number.isFinite(preOutcome.player.age) || preOutcome.player.age <= 0) {
    errors.push(`${experiment.id}: player age must be positive`);
  }
  if (!Number.isFinite(preOutcome.player.overall)) errors.push(`${experiment.id}: player overall must be finite`);
  if (!Number.isFinite(preOutcome.coach.multiplier) || preOutcome.coach.multiplier <= 0) {
    errors.push(`${experiment.id}: coach multiplier must be positive`);
  }
  if (affected.length === 0) errors.push(`${experiment.id}: coach must affect at least one stat`);

  const seen = new Set<string>();
  for (const stat of affected) {
    if (seen.has(stat)) errors.push(`${experiment.id}: duplicate affected stat ${stat}`);
    seen.add(stat);
    if (preOutcome.player.stats[stat] === undefined) {
      errors.push(`${experiment.id}: affected stat ${stat} has no pre-outcome player value`);
    }
  }

  for (const [stat, interval] of Object.entries(observed.statIntervals)) {
    errors.push(...intervalError(`${experiment.id}.observed.${stat}`, interval));
    if (!seen.has(stat)) errors.push(`${experiment.id}: observed stat ${stat} is not in affectedStats`);
  }
  if (observed.ovrDelta) errors.push(...intervalError(`${experiment.id}.observed.ovrDelta`, observed.ovrDelta));

  if (observed.stateChanged) {
    errors.push(`${experiment.id}: preview calibration must not mutate player state`);
  }

  const reference = experiment.externalFrozenPrediction;
  if (reference) {
    for (const [stat, interval] of Object.entries(reference.statIntervals)) {
      errors.push(...intervalError(`${experiment.id}.externalFrozenPrediction.${stat}`, interval));
      if (!seen.has(stat)) errors.push(`${experiment.id}: external prediction stat ${stat} is not in affectedStats`);
    }
    if (reference.ovrDelta) {
      errors.push(...intervalError(`${experiment.id}.externalFrozenPrediction.ovrDelta`, reference.ovrDelta));
    }
  }

  return errors;
}

export function validateCorpus(corpus: CoachCalibrationCorpus): string[] {
  const errors: string[] = [];
  if (corpus.schemaVersion !== 1) errors.push('corpus: unsupported schemaVersion');
  if (!corpus.baseCommit.trim()) errors.push('corpus: baseCommit is empty');

  const ids = new Set<string>();
  for (const experiment of corpus.experiments) {
    if (ids.has(experiment.id)) errors.push(`corpus: duplicate experiment id ${experiment.id}`);
    ids.add(experiment.id);
    errors.push(...validateExperiment(experiment));
  }
  return errors;
}
