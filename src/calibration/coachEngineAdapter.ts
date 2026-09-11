import profileJson from '../../profiles/game_2025.json';
import type { GameProfile } from '../types/resources';
import { projectCoachAction } from '../logic/recommendation';
import type {
  CalibrationPreOutcome,
  EngineExperimentPrediction,
} from './coachCalibrationTypes';

const profile = profileJson as unknown as GameProfile;

/**
 * Runs the exact production coach projection seam used by the application.
 * Observed outcome is intentionally absent from the signature, so calibration
 * evidence cannot leak into prediction.
 */
export function runProductionCoachPrediction(
  experimentId: string,
  preOutcome: CalibrationPreOutcome,
): EngineExperimentPrediction {
  const projection = projectCoachAction({
    player: preOutcome.player,
    stats: [...preOutcome.coach.affectedStats],
    sessions: preOutcome.coach.multiplier,
    profile,
    label: preOutcome.coach.title,
    transferClass: preOutcome.coach.transferClass,
  });

  if (projection.projectionStatus === 'unavailable') {
    return {
      experimentId,
      status: 'unavailable',
      profileVersion: profile.version,
      transferClass: projection.transferClass,
      reasonCodes: projection.reasons.map(reason => reason.code),
    };
  }

  return {
    experimentId,
    status: 'projected',
    profileVersion: profile.version,
    statPoints: Object.fromEntries(projection.statDeltas.map(delta => [delta.stat, delta.delta])),
    ovrBefore: projection.ovrBefore,
    ovrDelta: projection.ovrDelta,
  };
}
