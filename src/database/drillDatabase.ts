export type DrillIntensity = 'Very Easy' | 'Easy' | 'Medium' | 'Hard' | 'Very Hard';
export type DrillType = 'Attack' | 'Defence' | 'Physical' | 'Possession';

export interface Drill {
  name: string;
  type: DrillType;
  stats: string[];
  baseLoss: number; // base condition unit — all drills use 0.75; intensity multiplier scales the actual drain
  intensity: DrillIntensity; // fixed per drill
  isBase: boolean;  // false = unlocked via drill lab or event (greyed out by default)
}

export const DRILL_LIST: Drill[] = [
  // --- Attack ---
  { name: 'Target Practice',     type: 'Attack',     stats: ['SHOOTING', 'STRENGTH', 'REFLEXES'],                           baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Break Away',          type: 'Attack',     stats: ['CROSSING', 'PASSING', 'FINISHING', 'CREATIVITY'],             baseLoss: 0.75, intensity: 'Very Hard', isBase: true },
  { name: 'Run & Strike',        type: 'Attack',     stats: ['PASSING', 'DRIBBLING', 'SHOOTING'],                           baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Wide Channel',        type: 'Attack',     stats: ['CROSSING', 'FINISHING', 'SHOOTING', 'HEADING'],               baseLoss: 0.75, intensity: 'Hard',      isBase: true },
  { name: 'Touch and Go',        type: 'Attack',     stats: ['PASSING', 'DRIBBLING', 'CREATIVITY', 'FITNESS'],              baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Dead Ball Practice',  type: 'Attack',     stats: ['CROSSING', 'SHOOTING', 'PASSING'],                            baseLoss: 0.75, intensity: 'Easy',      isBase: false },
  { name: 'Cone Weave',          type: 'Attack',     stats: ['DRIBBLING', 'SPEED', 'AGILITY'],                              baseLoss: 0.75, intensity: 'Hard',      isBase: false },
  { name: 'Solo Finish',         type: 'Attack',     stats: ['FINISHING', 'SHOOTING', 'DRIBBLING'],                         baseLoss: 0.75, intensity: 'Easy',      isBase: false },
  { name: 'Aerial Work',         type: 'Attack',     stats: ['POSITIONING', 'PASSING', 'HEADING', 'CREATIVITY'],            baseLoss: 0.75, intensity: 'Easy',      isBase: false },
  { name: 'Attack Blueprint',    type: 'Attack',     stats: ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING'],  baseLoss: 0.75, intensity: 'Very Hard', isBase: false },

  // --- Possession ---
  { name: 'Touch Training',      type: 'Possession', stats: ['CONCENTRATION', 'DRIBBLING', 'HEADING', 'CREATIVITY'],        baseLoss: 0.75, intensity: 'Very Easy', isBase: true },
  { name: 'Tactical Review',     type: 'Possession', stats: ['CREATIVITY', 'POSITIONING', 'BRAVERY'],                       baseLoss: 0.75, intensity: 'Very Easy', isBase: true },
  { name: 'Build-Up Play',       type: 'Possession', stats: ['POSITIONING', 'CREATIVITY', 'FINISHING', 'PASSING', 'ANTICIPATION'], baseLoss: 0.75, intensity: 'Hard', isBase: false },
  { name: 'Wide Switch',         type: 'Possession', stats: ['COMMUNICATION', 'POSITIONING', 'CREATIVITY', 'CROSSING', 'PASSING', 'SPEED'], baseLoss: 0.75, intensity: 'Medium', isBase: false },
  { name: 'Channel Hold',        type: 'Possession', stats: ['POSITIONING', 'AERIAL REACH', 'SPEED', 'FITNESS'],            baseLoss: 0.75, intensity: 'Medium',    isBase: false },
  { name: 'Physical Duel',       type: 'Possession', stats: ['DRIBBLING', 'STRENGTH', 'MARKING', 'BRAVERY', 'AGGRESSION'], baseLoss: 0.75, intensity: 'Medium',    isBase: false },

  // --- Defence ---
  { name: 'Porky in Centre',     type: 'Defence',    stats: ['FITNESS', 'PASSING', 'TACKLING', 'POSITIONING', 'AGGRESSION'], baseLoss: 0.75, intensity: 'Easy',     isBase: true },
  { name: 'Pressure Trap',       type: 'Defence',    stats: ['AGGRESSION', 'TACKLING', 'MARKING', 'POSITIONING'],           baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Back Line Drill',     type: 'Defence',    stats: ['MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],               baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Challenge Drill',     type: 'Defence',    stats: ['TACKLING', 'MARKING', 'BRAVERY'],                             baseLoss: 0.75, intensity: 'Medium',    isBase: false },
  { name: 'Box Clearance',       type: 'Defence',    stats: ['HEADING', 'POSITIONING', 'MARKING'],                          baseLoss: 0.75, intensity: 'Medium',    isBase: false },
  { name: 'Compact Block',       type: 'Defence',    stats: ['POSITIONING', 'BRAVERY', 'MARKING'],                          baseLoss: 0.75, intensity: 'Easy',      isBase: false },
  { name: 'Win the Ball',        type: 'Defence',    stats: ['STRENGTH', 'MARKING', 'BRAVERY', 'DRIBBLING', 'TACKLING'],   baseLoss: 0.75, intensity: 'Easy',      isBase: false },
  { name: 'High Press',          type: 'Defence',    stats: ['AGGRESSION', 'POSITIONING', 'MARKING', 'BRAVERY', 'TACKLING'], baseLoss: 0.75, intensity: 'Hard',    isBase: false },
  { name: 'GK Protocol',         type: 'Defence',    stats: ['AGILITY', 'AERIAL REACH', 'THROWING', 'KICKING', 'REFLEXES'], baseLoss: 0.75, intensity: 'Hard',    isBase: false },
  { name: 'Defence Blueprint',   type: 'Defence',    stats: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],  baseLoss: 0.75, intensity: 'Very Hard', isBase: false },

  // --- Physical ---
  { name: 'Weight Room',         type: 'Physical',   stats: ['STRENGTH', 'FITNESS'],                                        baseLoss: 0.75, intensity: 'Very Hard', isBase: true },
  { name: 'Speed Work',          type: 'Physical',   stats: ['FITNESS', 'SPEED', 'DRIBBLING'],                              baseLoss: 0.75, intensity: 'Very Hard', isBase: true },
  { name: 'Endurance Loop',      type: 'Physical',   stats: ['FITNESS', 'SPEED'],                                           baseLoss: 0.75, intensity: 'Hard',      isBase: true },
  { name: 'Flexibility Session', type: 'Physical',   stats: ['FITNESS', 'AGILITY'],                                         baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Hurdle Work',         type: 'Physical',   stats: ['SPEED', 'AGILITY', 'PASSING'],                                baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Activation',          type: 'Physical',   stats: ['FITNESS', 'AGILITY'],                                         baseLoss: 0.75, intensity: 'Very Easy', isBase: false },
  { name: 'Footwork Ladder',     type: 'Physical',   stats: ['AGILITY', 'SPEED', 'FITNESS'],                                baseLoss: 0.75, intensity: 'Easy',      isBase: false },
  { name: 'Interval Runs',       type: 'Physical',   stats: ['SPEED', 'FITNESS'],                                           baseLoss: 0.75, intensity: 'Hard',      isBase: false },
  { name: 'Plyometrics',         type: 'Physical',   stats: ['AGILITY', 'SPEED', 'STRENGTH'],                               baseLoss: 0.75, intensity: 'Hard',      isBase: false },
];
