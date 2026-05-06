export interface Drill {
  name: string;
  type: 'Attack' | 'Defence' | 'Physical';
  stats: string[];
  baseLoss: number; // base condition % lost at Amateur level with no Fan Club reduction
}

export const DRILL_LIST: Drill[] = [
  // --- Attack ---
  { name: 'Skill Drill',            type: 'Attack',   stats: ['CREATIVITY', 'DRIBBLING', 'PASSING'],              baseLoss: 1.5 },
  { name: 'Shooting Technique',     type: 'Attack',   stats: ['SHOOTING', 'STRENGTH', 'REFLEXES'],                baseLoss: 2.25 },
  { name: 'Fast Counter-Attacks',   type: 'Attack',   stats: ['CROSSING', 'PASSING', 'FINISHING', 'CREATIVITY'],  baseLoss: 3.75 },
  { name: 'Pass, Go & Shoot',       type: 'Attack',   stats: ['PASSING', 'DRIBBLING', 'SHOOTING'],                baseLoss: 2.25 },
  { name: 'Wing Play',              type: 'Attack',   stats: ['CROSSING', 'FINISHING', 'SHOOTING', 'HEADING'],    baseLoss: 3.0 },
  { name: 'Set-Piece Delivery',     type: 'Attack',   stats: ['CROSSING', 'SHOOTING', 'PASSING'],                 baseLoss: 1.5 },
  { name: 'Slalom Dribble',         type: 'Attack',   stats: ['DRIBBLING', 'SPEED', 'AGILITY'],                   baseLoss: 1.5 },
  { name: '1-on-1 Finishing',       type: 'Attack',   stats: ['FINISHING', 'SHOOTING', 'DRIBBLING'],              baseLoss: 2.25 },
  { name: 'Use Your Head',          type: 'Attack',   stats: ['HEADING', 'STRENGTH', 'POSITIONING'],              baseLoss: 1.5 },

  // --- Defence ---
  { name: 'Piggy in the Middle',    type: 'Defence',  stats: ['FITNESS', 'PASSING', 'TACKLING', 'POSITIONING'],   baseLoss: 1.5 },
  { name: 'Press the Play',         type: 'Defence',  stats: ['AGGRESSION', 'TACKLING', 'MARKING', 'POSITIONING'], baseLoss: 2.25 },
  { name: 'Defensive Line',         type: 'Defence',  stats: ['MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],    baseLoss: 1.5 },
  { name: 'Video Analysis',         type: 'Defence',  stats: ['CREATIVITY', 'POSITIONING', 'BRAVERY'],            baseLoss: 0.75 },
  { name: 'Stop the Attacker',      type: 'Defence',  stats: ['TACKLING', 'MARKING', 'BRAVERY'],                  baseLoss: 2.25 },
  { name: 'Defending Crosses',      type: 'Defence',  stats: ['HEADING', 'POSITIONING', 'MARKING'],               baseLoss: 1.5 },
  { name: 'Hold the Line',          type: 'Defence',  stats: ['POSITIONING', 'BRAVERY', 'MARKING'],               baseLoss: 1.5 },

  // --- Physical ---
  { name: 'Gym',                    type: 'Physical', stats: ['STRENGTH', 'FITNESS'],                             baseLoss: 4.5 },
  { name: 'Sprints',                type: 'Physical', stats: ['FITNESS', 'SPEED', 'DRIBBLING'],                   baseLoss: 2.25 },
  { name: 'Long Run',               type: 'Physical', stats: ['FITNESS', 'STAMINA', 'SPEED'],                     baseLoss: 3.0 },
  { name: 'Stretch',                type: 'Physical', stats: ['FITNESS', 'STAMINA', 'AGILITY'],                   baseLoss: 0.75 },
  { name: 'Hurdles',                type: 'Physical', stats: ['SPEED', 'AGILITY', 'PASSING'],                     baseLoss: 1.5 },
  { name: 'Warm-Up',                type: 'Physical', stats: ['FITNESS', 'AGILITY'],                              baseLoss: 0.5 },
  { name: 'Carioca with Ladders',   type: 'Physical', stats: ['AGILITY', 'SPEED', 'FITNESS'],                     baseLoss: 1.5 },
  { name: 'Shuttle Runs',           type: 'Physical', stats: ['SPEED', 'FITNESS', 'STAMINA'],                     baseLoss: 2.25 },
  { name: 'Hurdle Jumps',           type: 'Physical', stats: ['AGILITY', 'SPEED', 'STRENGTH'],                    baseLoss: 1.5 },
];
