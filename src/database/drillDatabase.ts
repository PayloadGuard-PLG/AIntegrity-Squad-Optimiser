export type DrillIntensity = 'Very Easy' | 'Easy' | 'Medium' | 'Hard' | 'Very Hard';

export interface Drill {
  name: string;
  type: 'Attack' | 'Defence' | 'Physical';
  stats: string[];
  baseLoss: number; // base condition % lost at Very Easy level with no Fan Club reduction
  intensity: DrillIntensity; // fixed per drill
  isBase: boolean;  // false = unlocked via drill lab or event (greyed out by default)
}

export const DRILL_LIST: Drill[] = [
  // --- Attack ---
  { name: 'Touch Training',      type: 'Attack',   stats: ['CONCENTRATION', 'DRIBBLING', 'HEADING', 'CREATIVITY'], baseLoss: 0.75, intensity: 'Very Easy', isBase: true },
  { name: 'Target Practice',     type: 'Attack',   stats: ['SHOOTING', 'STRENGTH', 'REFLEXES'],                    baseLoss: 2.25, intensity: 'Easy',      isBase: true },
  { name: 'Break Away',          type: 'Attack',   stats: ['CROSSING', 'PASSING', 'FINISHING', 'CREATIVITY'],      baseLoss: 3.75, intensity: 'Hard',      isBase: true },
  { name: 'Run & Strike',        type: 'Attack',   stats: ['PASSING', 'DRIBBLING', 'SHOOTING'],                    baseLoss: 2.25, intensity: 'Medium',    isBase: true },
  { name: 'Wide Channel',        type: 'Attack',   stats: ['CROSSING', 'FINISHING', 'SHOOTING', 'HEADING'],        baseLoss: 3.0,  intensity: 'Hard',      isBase: true },
  { name: 'Dead Ball Practice',  type: 'Attack',   stats: ['CROSSING', 'SHOOTING', 'PASSING'],                     baseLoss: 1.5,  intensity: 'Easy',      isBase: false },
  { name: 'Cone Weave',          type: 'Attack',   stats: ['DRIBBLING', 'SPEED', 'AGILITY'],                       baseLoss: 1.5,  intensity: 'Easy',      isBase: false },
  { name: 'Solo Finish',         type: 'Attack',   stats: ['FINISHING', 'SHOOTING', 'DRIBBLING'],                  baseLoss: 2.25, intensity: 'Easy',      isBase: false },
  { name: 'Aerial Work',         type: 'Attack',   stats: ['HEADING', 'STRENGTH', 'POSITIONING'],                  baseLoss: 1.5,  intensity: 'Easy',      isBase: false },

  // --- Defence ---
  { name: 'Porky in Centre',     type: 'Defence',  stats: ['FITNESS', 'PASSING', 'TACKLING', 'POSITIONING'],       baseLoss: 1.5,  intensity: 'Easy',      isBase: true },
  { name: 'Pressure Trap',       type: 'Defence',  stats: ['AGGRESSION', 'TACKLING', 'MARKING', 'POSITIONING'],    baseLoss: 2.25, intensity: 'Medium',    isBase: true },
  { name: 'Back Line Drill',     type: 'Defence',  stats: ['MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],        baseLoss: 1.5,  intensity: 'Easy',      isBase: true },
  { name: 'Tactical Review',     type: 'Defence',  stats: ['CREATIVITY', 'POSITIONING', 'BRAVERY'],                baseLoss: 0.75, intensity: 'Very Easy', isBase: true },
  { name: 'Challenge Drill',     type: 'Defence',  stats: ['TACKLING', 'MARKING', 'BRAVERY'],                      baseLoss: 2.25, intensity: 'Medium',    isBase: false },
  { name: 'Box Clearance',       type: 'Defence',  stats: ['HEADING', 'POSITIONING', 'MARKING'],                   baseLoss: 1.5,  intensity: 'Easy',      isBase: false },
  { name: 'Compact Block',       type: 'Defence',  stats: ['POSITIONING', 'BRAVERY', 'MARKING'],                   baseLoss: 1.5,  intensity: 'Easy',      isBase: false },

  // --- Physical ---
  { name: 'Weight Room',         type: 'Physical', stats: ['STRENGTH', 'FITNESS'],                                 baseLoss: 4.5,  intensity: 'Very Hard', isBase: true },
  { name: 'Speed Work',          type: 'Physical', stats: ['FITNESS', 'SPEED', 'DRIBBLING'],                       baseLoss: 2.25, intensity: 'Medium',    isBase: true },
  { name: 'Endurance Loop',      type: 'Physical', stats: ['FITNESS', 'STAMINA', 'SPEED'],                         baseLoss: 3.0,  intensity: 'Hard',      isBase: true },
  { name: 'Flexibility Session', type: 'Physical', stats: ['FITNESS', 'STAMINA', 'AGILITY'],                       baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Hurdle Work',         type: 'Physical', stats: ['SPEED', 'AGILITY', 'PASSING'],                         baseLoss: 1.5,  intensity: 'Easy',      isBase: true },
  { name: 'Activation',          type: 'Physical', stats: ['FITNESS', 'AGILITY'],                                  baseLoss: 0.5,  intensity: 'Very Easy', isBase: false },
  { name: 'Footwork Ladder',     type: 'Physical', stats: ['AGILITY', 'SPEED', 'FITNESS'],                         baseLoss: 1.5,  intensity: 'Easy',      isBase: false },
  { name: 'Interval Runs',       type: 'Physical', stats: ['SPEED', 'FITNESS', 'STAMINA'],                         baseLoss: 2.25, intensity: 'Medium',    isBase: false },
  { name: 'Plyometrics',         type: 'Physical', stats: ['AGILITY', 'SPEED', 'STRENGTH'],                        baseLoss: 1.5,  intensity: 'Easy',      isBase: false },
];
