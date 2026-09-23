export type DrillIntensity = 'Very Easy' | 'Easy' | 'Medium' | 'Hard' | 'Very Hard';
export type DrillType = 'Attack' | 'Defence' | 'Possession' | 'Physical';

export interface Drill {
  name: string;
  type: DrillType;
  stats: string[];
  baseLoss: number; // base condition unit — all baseline drills use 0.75; intensity scales nominal drain
  intensity: DrillIntensity; // fixed per drill
  isBase: boolean;  // true = current ordinary baseline; special/reward/event drills are modelled separately
}

/**
 * Current ordinary baseline drill catalogue.
 * Ground truth: direct 2026-09-23 drill-picker captures.
 * Special/reward/masterclass drills are intentionally excluded.
 */
export const DRILL_LIST: Drill[] = [
  // --- Attack (7) ---
  { name: 'Solo Finish',         type: 'Attack',     stats: ['FINISHING', 'TACKLING', 'ANTICIPATION', 'DRIBBLING', 'RUSHING OUT'], baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Run & Strike',        type: 'Attack',     stats: ['ANTICIPATION', 'SPEED', 'SHOOTING', 'PASSING'],                      baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Dead Ball Practice',  type: 'Attack',     stats: ['RUSHING OUT', 'CROSSING', 'SHOOTING', 'HEADING', 'MARKING'],         baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Target Practice',     type: 'Attack',     stats: ['AGILITY', 'FINISHING', 'STRENGTH', 'REFLEXES', 'SHOOTING'],          baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Cone Weave',          type: 'Attack',     stats: ['SPEED', 'FITNESS', 'PASSING', 'DRIBBLING'],                          baseLoss: 0.75, intensity: 'Hard',      isBase: true },
  { name: 'Wide Channel',        type: 'Attack',     stats: ['FINISHING', 'CROSSING', 'PUNCHING', 'SHOOTING', 'HEADING'],           baseLoss: 0.75, intensity: 'Hard',      isBase: true },
  { name: 'Break Away',          type: 'Attack',     stats: ['FINISHING', 'CROSSING', 'COMMUNICATION', 'PASSING', 'CREATIVITY'],    baseLoss: 0.75, intensity: 'Very Hard', isBase: true },

  // --- Defence (7) ---
  { name: 'Tactical Review',     type: 'Defence',    stats: ['CREATIVITY', 'BRAVERY', 'POSITIONING', 'COMMUNICATION'],              baseLoss: 0.75, intensity: 'Very Easy', isBase: true },
  { name: 'Head Drill',          type: 'Defence',    stats: ['CREATIVITY', 'HEADING', 'POSITIONING', 'PASSING'],                   baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Line Hold',           type: 'Defence',    stats: ['MARKING', 'CONCENTRATION', 'POSITIONING', 'COMMUNICATION'],          baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Win the Ball',        type: 'Defence',    stats: ['BRAVERY', 'TACKLING', 'STRENGTH', 'DRIBBLING', 'MARKING'],           baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Cross Defence',       type: 'Defence',    stats: ['BRAVERY', 'CROSSING', 'AERIAL REACH', 'HEADING', 'MARKING'],        baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'High Press',          type: 'Defence',    stats: ['POSITIONING', 'TACKLING', 'AGGRESSION', 'MARKING', 'BRAVERY'],      baseLoss: 0.75, intensity: 'Hard',      isBase: true },
  { name: 'GK Protocol',         type: 'Defence',    stats: ['AGILITY', 'AERIAL REACH', 'REFLEXES', 'KICKING', 'THROWING'],       baseLoss: 0.75, intensity: 'Hard',      isBase: true },

  // --- Possession (7) ---
  { name: 'Touch Training',      type: 'Possession', stats: ['CREATIVITY', 'CONCENTRATION', 'HEADING', 'DRIBBLING'],               baseLoss: 0.75, intensity: 'Very Easy', isBase: true },
  { name: 'Porky in Centre',     type: 'Possession', stats: ['POSITIONING', 'TACKLING', 'FITNESS', 'AGGRESSION', 'PASSING'],       baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'First Touch',         type: 'Possession', stats: ['FITNESS', 'THROWING', 'PASSING', 'DRIBBLING'],                       baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Wide Switch',         type: 'Possession', stats: ['CREATIVITY', 'COMMUNICATION', 'CROSSING', 'POSITIONING', 'PASSING', 'SPEED'], baseLoss: 0.75, intensity: 'Medium', isBase: true },
  { name: 'Channel Hold',        type: 'Possession', stats: ['SPEED', 'FITNESS', 'AERIAL REACH', 'POSITIONING'],                   baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Physical Duel',       type: 'Possession', stats: ['BRAVERY', 'STRENGTH', 'AGGRESSION', 'DRIBBLING', 'MARKING'],        baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Build-Up Play',       type: 'Possession', stats: ['POSITIONING', 'FINISHING', 'ANTICIPATION', 'PASSING', 'CREATIVITY'], baseLoss: 0.75, intensity: 'Hard',      isBase: true },

  // --- Physical (8) ---
  { name: 'Activation',          type: 'Physical',   stats: ['FITNESS', 'REFLEXES', 'AGGRESSION', 'HEADING'],                      baseLoss: 0.75, intensity: 'Very Easy', isBase: true },
  { name: 'Flexibility Session', type: 'Physical',   stats: ['SPEED', 'FITNESS', 'AGILITY', 'STRENGTH'],                           baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Footwork Ladder',     type: 'Physical',   stats: ['CONCENTRATION', 'SPEED', 'AGILITY', 'AGGRESSION'],                   baseLoss: 0.75, intensity: 'Easy',      isBase: true },
  { name: 'Endurance Loop',      type: 'Physical',   stats: ['CONCENTRATION', 'FITNESS', 'SPEED'],                                baseLoss: 0.75, intensity: 'Medium',    isBase: true },
  { name: 'Shuttle Run',         type: 'Physical',   stats: ['SPEED', 'AGILITY', 'BRAVERY', 'STRENGTH'],                           baseLoss: 0.75, intensity: 'Hard',      isBase: true },
  { name: 'Hurdle Work',         type: 'Physical',   stats: ['SPEED', 'AGGRESSION', 'BRAVERY', 'KICKING'],                         baseLoss: 0.75, intensity: 'Hard',      isBase: true },
  { name: 'Weight Room',         type: 'Physical',   stats: ['FITNESS', 'THROWING', 'KICKING', 'STRENGTH'],                        baseLoss: 0.75, intensity: 'Very Hard', isBase: true },
  { name: 'Speed Work',          type: 'Physical',   stats: ['SPEED', 'FITNESS', 'RUSHING OUT', 'DRIBBLING'],                      baseLoss: 0.75, intensity: 'Very Hard', isBase: true },
];
