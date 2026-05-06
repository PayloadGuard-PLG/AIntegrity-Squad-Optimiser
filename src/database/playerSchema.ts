export interface Player {
  id: string;
  name: string;
  role: string[]; 
  age: number;
  overall: number;
  stats: Record<string, number>;
  isMutantCandidate: boolean;
}

export const INITIAL_PLAYER_STATE: Player = {
  id: '',
  name: '',
  role: ['ST'],
  age: 18,
  overall: 40,
  stats: {},
  isMutantCandidate: false
};
