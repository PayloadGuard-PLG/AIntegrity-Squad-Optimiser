import { TierName } from './resources';

export type EvidenceStatus = 'confirmed' | 'observed' | 'calibrating' | 'unknown';
export type TransitionKind = 'role' | 'tier' | 'playstyle' | 'deployment' | 'mentor' | 'coach';
export type PlaystyleLevel = 'Standard' | 'Intermediate' | 'Advanced' | 'Master';

export interface PlannedPlaystyle {
  id: string;
  level: PlaystyleLevel;
}

export interface PlayerPlanningState {
  roles: string[];
  stats: Record<string, number>;
  overall: number;
  tier: TierName;
  playstyle?: PlannedPlaystyle | null;
  deployedRole?: string | null;
}

export interface TransitionDelta {
  stat: string;
  before: number;
  after: number;
}

export interface StateTransitionResult {
  kind: TransitionKind;
  label: string;
  before: PlayerPlanningState;
  after: PlayerPlanningState;
  deltas: TransitionDelta[];
  newlyWhite: string[];
  evidence: EvidenceStatus;
  /**
   * Preview branches are always discardable in the optimiser. This flag describes
   * the source-game action itself: roles, tiers and playstyles cannot be undone
   * after the player commits them in game.
   */
  gameReversible: boolean;
  notes: string[];
}

export interface TierPathStep {
  tier: TierName;
  pointsRequired: number;
}
