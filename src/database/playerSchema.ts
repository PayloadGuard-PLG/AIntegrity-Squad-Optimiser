import { TierName, TalentTier } from '../types/resources';
import { PlaystyleFamily, StatBoost } from '../logic/glyphReader';

export type { PlaystyleFamily, StatBoost };

export interface PlayerSnapshot {
  stats: Record<string, number>;
  overall: number;
  tier: TierName;
}

export interface Player {
  id: string;
  name: string;
  role: string[];
  age: number;
  overall: number;
  tier: TierName;
  talent: TalentTier;
  stats: Record<string, number>;
  isMutantCandidate: boolean;
  snapshot?: PlayerSnapshot | null;
  newRole?: string | null;
  newRolePoints?: number;
  /** Badge family. 'unknown' until read or confirmed — never inferred. */
  playstyle?: PlaystyleFamily;
  /** Ability template ids; 0..n. */
  specialAbilities?: string[];
  /**
   * Conditional overlays keyed by stat name. `stats[X]` always holds the BASE
   * value; a boost is never folded into it. Training cost, XP budget and every
   * projection read `stats` only — an effective value (base + active boost) is
   * for match/display and is never persisted back into `stats`.
   */
  boosts?: Record<string, StatBoost>;
}

export const INITIAL_PLAYER_STATE: Player = {
  id: '',
  name: '',
  role: ['ST'],
  age: 18,
  overall: 40,
  tier: 'T0',
  talent: 'Unknown',
  stats: {},
  isMutantCandidate: false,
  snapshot: null,
  playstyle: 'unknown',
  specialAbilities: undefined,
  boosts: undefined,
};
