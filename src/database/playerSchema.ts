import { TierName } from '../types/resources';

export interface Player {
  id: string;
  name: string;
  role: string[];
  age: number;
  overall: number;
  tier: TierName;
  stats: Record<string, number>;  // Raw stat values (e.g. 97, 312, 436)
  isMutantCandidate: boolean;
}

export const INITIAL_PLAYER_STATE: Player = {
  id: '',
  name: '',
  role: ['ST'],
  age: 18,
  overall: 40,
  tier: 'None',
  stats: {},
  isMutantCandidate: false
};
