import type { EvidenceStatus, TransitionKind } from '../../types/planning';

export interface StateLabPlayerSummary {
  playerId: string;
  name: string;
  age: number;
  overall: number;
  roles: string[];
  tierLabel: string;
  playstyleName?: string | null;
  playstyleLevel?: string | null;
  deployedRole?: string | null;
}

export interface StateLabActionStepView {
  id: string;
  order: number;
  kind: TransitionKind;
  title: string;
  subtitle?: string;
  gameReversible: boolean;
  evidence: EvidenceStatus;
  detailLines?: string[];
}

export interface StateLabResourceStatus {
  label: string;
  available: number;
  required: number;
  shortage: number;
  covered: boolean;
}

export interface StateLabStatDeltaView {
  stat: string;
  before: number;
  after: number;
  low?: number;
  high?: number;
}

export interface StateLabProjectionSummary {
  currentOvr: number;
  projectedOvr: number;
  currentWhiteCount: number;
  projectedWhiteCount: number;
  statChanges: StateLabStatDeltaView[];
}

export interface StateLabReferenceTile {
  id: string;
  title: string;
  body: string;
  evidence: EvidenceStatus;
  tone: 'success' | 'info' | 'purple' | 'warning' | 'neutral';
}

export interface StateLabViewModel {
  player: StateLabPlayerSummary;
  path: StateLabActionStepView[];
  resources: StateLabResourceStatus[];
  projection: StateLabProjectionSummary;
  references: StateLabReferenceTile[];
  freeRoleAvailable: boolean;
  canSavePlan: boolean;
  modelBoundary: string;
}
