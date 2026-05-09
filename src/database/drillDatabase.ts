export interface Drill {
  name: string;
  type: 'Attack' | 'Defence' | 'Physical';
  stats: string[];
  baseLoss: number; // base condition % lost per session at Very Easy (no fan club). All drills = 0.75.
  isBase: boolean;  // false = unlocked via drill lab or event (greyed out by default)
}

// Confirmed from game screenshots: condition loss is purely difficulty-driven.
// Every drill has the same base loss at a given intensity (Very Easy = 0.75%).
// DIFFICULTY_MULTIPLIERS in conditionEngine scale this: E=×2, M=×3, H=×4, VH=×5.
export const DRILL_LIST: Drill[] = [
  // --- Attack ---
  { name: 'First Touch Play',       type: 'Attack',   stats: ['PASSING', 'DRIBBLING', 'CREATIVITY', 'FITNESS'],                     baseLoss: 0.75, isBase: true },
  { name: 'Shooting Technique',     type: 'Attack',   stats: ['SHOOTING', 'STRENGTH', 'REFLEXES'],                                  baseLoss: 0.75, isBase: true },
  { name: 'Fast Counter-Attacks',   type: 'Attack',   stats: ['CROSSING', 'PASSING', 'FINISHING', 'CREATIVITY'],                    baseLoss: 0.75, isBase: true },
  { name: 'Pass, Go & Shoot',       type: 'Attack',   stats: ['PASSING', 'DRIBBLING', 'SHOOTING'],                                  baseLoss: 0.75, isBase: true },
  { name: 'Wing Play',              type: 'Attack',   stats: ['CROSSING', 'FINISHING', 'SHOOTING', 'HEADING'],                      baseLoss: 0.75, isBase: true },
  { name: 'Rapid Side Switch',      type: 'Attack',   stats: ['COMMUNICATION', 'POSITIONING', 'CREATIVITY', 'CROSSING', 'PASSING', 'SPEED'], baseLoss: 0.75, isBase: false },
  { name: 'Set-Piece Delivery',     type: 'Attack',   stats: ['CROSSING', 'SHOOTING', 'PASSING'],                                   baseLoss: 0.75, isBase: false },
  { name: 'Slalom Dribble',         type: 'Attack',   stats: ['DRIBBLING', 'SPEED', 'AGILITY'],                                     baseLoss: 0.75, isBase: false },
  { name: '1-on-1 Finishing',       type: 'Attack',   stats: ['FINISHING', 'SHOOTING', 'DRIBBLING'],                                baseLoss: 0.75, isBase: false },

  // --- Defence ---
  { name: 'Use Your Head',          type: 'Defence',  stats: ['POSITIONING', 'PASSING', 'HEADING', 'CREATIVITY'],                   baseLoss: 0.75, isBase: false },
  { name: 'Piggy in the Middle',    type: 'Defence',  stats: ['FITNESS', 'PASSING', 'TACKLING', 'POSITIONING', 'AGGRESSION'],       baseLoss: 0.75, isBase: true },
  { name: 'Press the Play',         type: 'Defence',  stats: ['AGGRESSION', 'TACKLING', 'MARKING', 'POSITIONING'],                  baseLoss: 0.75, isBase: true },
  { name: 'Defensive Line',         type: 'Defence',  stats: ['MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],                      baseLoss: 0.75, isBase: true },
  { name: 'Video Analysis',         type: 'Defence',  stats: ['CREATIVITY', 'POSITIONING', 'BRAVERY', 'COMMUNICATION'],             baseLoss: 0.75, isBase: true },
  { name: 'Stop the Attacker',      type: 'Defence',  stats: ['STRENGTH', 'MARKING', 'BRAVERY', 'DRIBBLING', 'TACKLING'],          baseLoss: 0.75, isBase: false },
  { name: 'Defending Crosses',      type: 'Defence',  stats: ['HEADING', 'POSITIONING', 'MARKING'],                                 baseLoss: 0.75, isBase: false },
  { name: 'Hold the Line',          type: 'Defence',  stats: ['POSITIONING', 'BRAVERY', 'MARKING'],                                 baseLoss: 0.75, isBase: false },

  // --- Physical ---
  { name: 'Gym',                    type: 'Physical', stats: ['STRENGTH', 'FITNESS'],                                               baseLoss: 0.75, isBase: true },
  { name: 'Sprints',                type: 'Physical', stats: ['FITNESS', 'SPEED', 'DRIBBLING', 'RUSHING OUT'],                      baseLoss: 0.75, isBase: true },
  { name: 'Long Run',               type: 'Physical', stats: ['FITNESS', 'CONCENTRATION', 'SPEED'],                                 baseLoss: 0.75, isBase: true },
  { name: 'Stretch',                type: 'Physical', stats: ['STRENGTH', 'AGILITY', 'SPEED', 'FITNESS'],                          baseLoss: 0.75, isBase: true },
  { name: 'Hurdles',                type: 'Physical', stats: ['SPEED', 'AGILITY', 'PASSING'],                                       baseLoss: 0.75, isBase: true },
  { name: 'Warm-Up',                type: 'Physical', stats: ['FITNESS', 'HEADING', 'AGGRESSION', 'REFLEXES'],                      baseLoss: 0.75, isBase: false },
  { name: 'Carioca with Ladders',   type: 'Physical', stats: ['AGGRESSION', 'AGILITY', 'CONCENTRATION', 'SPEED'],                  baseLoss: 0.75, isBase: false },
  { name: 'Shuttle Runs',           type: 'Physical', stats: ['SPEED', 'FITNESS', 'AGILITY', 'BRAVERY'],                           baseLoss: 0.75, isBase: false },
  { name: 'Hurdle Jumps',           type: 'Physical', stats: ['AGILITY', 'SPEED', 'STRENGTH'],                                     baseLoss: 0.75, isBase: false },
];
