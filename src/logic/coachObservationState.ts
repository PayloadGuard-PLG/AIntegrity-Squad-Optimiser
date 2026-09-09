import type { CoachTransferClass } from './coachTransfer';
import type { CoachPreviewInterval } from './recommendation';

export interface CoachObservationState {
  transferClass: CoachTransferClass;
  observedGainIntervals: CoachPreviewInterval[];
  selectedStats: string[];
}

/** Manual stat correction changes targeting only; scan provenance survives. */
export function withManualStatSelection(
  state: CoachObservationState,
  selectedStats: string[],
): CoachObservationState {
  return { ...state, selectedStats: [...selectedStats] };
}
