import { TierName, TalentTier } from '../types/resources';

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
}

export const INITIAL_PLAYER_STATE: Player = {
  id: '',
  name: '',
  role: ['ST'],
  age: 18,
  overall: 40,
  tier: 'None',
  talent: 'Normal',
  stats: {},
  isMutantCandidate: false,
};
