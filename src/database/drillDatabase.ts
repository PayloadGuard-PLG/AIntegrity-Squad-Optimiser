export interface Drill {
  name: string;
  type: 'Attack' | 'Defence' | 'Physical';
  stats: string[];
  baseLoss: number; // base condition % lost at Very Easy level with no Fan Club reduction
  isBase: boolean;  // false = unlocked via drill lab or event (greyed out by default)
}

export const DRILL_LIST: Drill[] = [
  // --- Attack ---
  { name: 'Skill Drill',            type: 'Attack',   stats: ['CREATIVITY', 'DRIBBLING', 'PASSING'],              baseLoss: 1.5,  isBase: true },
  { name: 'Shooting Technique',     type: 'Attack',   stats: ['SHOOTING', 'STRENGTH', 'REFLEXES'],                baseLoss: 2.25, isBase: true },
  { name: 'Fast Counter-Attacks',   type: 'Attack',   stats: ['CROSSING', 'PASSING', 'FINISHING', 'CREATIVITY'],  baseLoss: 3.75, isBase: true },
  { name: 'Pass, Go & Shoot',       type: 'Attack',   stats: ['PASSING', 'DRIBBLING', 'SHOOTING'],                baseLoss: 2.25, isBase: true },
  { name: 'Wing Play',              type: 'Attack',   stats: ['CROSSING', 'FINISHING', 'SHOOTING', 'HEADING'],    baseLoss: 3.0,  isBase: true },
  { name: 'Set-Piece Delivery',     type: 'Attack',   stats: ['CROSSING', 'SHOOTING', 'PASSING'],                 baseLoss: 1.5,  isBase: false },
  { name: 'Slalom Dribble',         type: 'Attack',   stats: ['DRIBBLING', 'SPEED', 'AGILITY'],                   baseLoss: 1.5,  isBase: false },
  { name: '1-on-1 Finishing',       type: 'Attack',   stats: ['FINISHING', 'SHOOTING', 'DRIBBLING'],              baseLoss: 2.25, isBase: false },
  { name: 'Use Your Head',          type: 'Defence',  stats: ['POSITIONING', 'PASSING', 'HEADING', 'CREATIVITY'],   baseLoss: 3.0,  isBase: false },

  // --- Defence ---
  { name: 'Piggy in the Middle',    type: 'Defence',  stats: ['FITNESS', 'PASSING', 'TACKLING', 'POSITIONING'],   baseLoss: 1.5,  isBase: true },
  { name: 'Press the Play',         type: 'Defence',  stats: ['AGGRESSION', 'TACKLING', 'MARKING', 'POSITIONING'], baseLoss: 2.25, isBase: true },
  { name: 'Defensive Line',         type: 'Defence',  stats: ['MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],    baseLoss: 1.5,  isBase: true },
  { name: 'Video Analysis',         type: 'Defence',  stats: ['CREATIVITY', 'POSITIONING', 'BRAVERY'],            baseLoss: 0.75, isBase: true },
  { name: 'Stop the Attacker',      type: 'Defence',  stats: ['STRENGTH', 'MARKING', 'BRAVERY', 'DRIBBLING', 'TACKLING'], baseLoss: 4.5, isBase: false },
  { name: 'Defending Crosses',      type: 'Defence',  stats: ['HEADING', 'POSITIONING', 'MARKING'],               baseLoss: 1.5,  isBase: false },
  { name: 'Hold the Line',          type: 'Defence',  stats: ['POSITIONING', 'BRAVERY', 'MARKING'],               baseLoss: 1.5,  isBase: false },

  // --- Physical ---
  { name: 'Gym',                    type: 'Physical', stats: ['STRENGTH', 'FITNESS'],                             baseLoss: 4.5,  isBase: true },
  { name: 'Sprints',                type: 'Physical', stats: ['FITNESS', 'SPEED', 'DRIBBLING'],                   baseLoss: 2.25, isBase: true },
  { name: 'Long Run',               type: 'Physical', stats: ['FITNESS', 'STAMINA', 'SPEED'],                     baseLoss: 3.0,  isBase: true },
  { name: 'Stretch',                type: 'Physical', stats: ['FITNESS', 'STAMINA', 'AGILITY'],                   baseLoss: 0.75, isBase: true },
  { name: 'Hurdles',                type: 'Physical', stats: ['SPEED', 'AGILITY', 'PASSING'],                     baseLoss: 1.5,  isBase: true },
  { name: 'Warm-Up',                type: 'Physical', stats: ['FITNESS', 'AGILITY'],                              baseLoss: 0.5,  isBase: false },
  { name: 'Carioca with Ladders',   type: 'Physical', stats: ['AGILITY', 'SPEED', 'FITNESS'],                     baseLoss: 1.5,  isBase: false },
  { name: 'Shuttle Runs',           type: 'Physical', stats: ['SPEED', 'FITNESS', 'STAMINA'],                     baseLoss: 2.25, isBase: false },
  { name: 'Hurdle Jumps',           type: 'Physical', stats: ['AGILITY', 'SPEED', 'STRENGTH'],                    baseLoss: 1.5,  isBase: false },
];
