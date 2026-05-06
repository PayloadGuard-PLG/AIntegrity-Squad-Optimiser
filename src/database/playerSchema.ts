/**
 * playerSchema.ts: Squad Data Structure
 * Defines the attributes required for the Optimiser to calculate gains. 
 */

export interface Player {
  id: string;
  name: string;
  role: 'ST' | 'DC' | 'GK' | 'MC'; [cite: 5]
  age: number;
  overall: number;
  stats: Record<string, number>; // e.g., { FINISHING: 120, SPEED: 80 }
  isMutantCandidate: boolean; // Flag for Zero Drain Protocol 
}

export const INITIAL_PLAYER_STATE: Player = {
  id: '',
  name: '',
  role: 'ST', [cite: 5]
  age: 18,
  overall: 40,
  stats: {},
  isMutantCandidate: false
};
