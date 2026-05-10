export interface Drill {
  name: string;
  type: 'Attack' | 'Defence' | 'Physical';
  stats: string[];
  baseLoss: number; // base condition % lost at Very Easy, before fan club reduction
  isBase: boolean;  // false = unlocked via drill lab or event
}

// All drills share the same baseLoss = 0.75%.
// Actual condition cost = 0.75 × drillLevelMultiplier × fanClubRetention.
// Confirmed from in-game screenshots: condition loss depends on difficulty, not the specific drill.
const BASE_LOSS = 0.75;

export const DRILL_LIST: Drill[] = [
  // --- Attack ---
  { name: 'First Touch Play',       type: 'Attack',   stats: ['PASSING', 'DRIBBLING', 'CREATIVITY', 'FITNESS'],     baseLoss: BASE_LOSS, isBase: true },
  { name: 'Shooting Technique',     type: 'Attack',   stats: ['SHOOTING', 'STRENGTH', 'REFLEXES'],                  baseLoss: BASE_LOSS, isBase: true },
  { name: 'Fast Counter-Attacks',   type: 'Attack',   stats: ['CROSSING', 'PASSING', 'FINISHING', 'CREATIVITY'],    baseLoss: BASE_LOSS, isBase: true },
  { name: 'Pass, Go & Shoot',       type: 'Attack',   stats: ['PASSING', 'DRIBBLING', 'SHOOTING'],                  baseLoss: BASE_LOSS, isBase: true },
  { name: 'Wing Play',              type: 'Attack',   stats: ['CROSSING', 'FINISHING', 'SHOOTING', 'HEADING'],      baseLoss: BASE_LOSS, isBase: true },
  { name: 'Set-Piece Delivery',     type: 'Attack',   stats: ['CROSSING', 'SHOOTING', 'PASSING'],                   baseLoss: BASE_LOSS, isBase: false },
  { name: 'Slalom Dribble',         type: 'Attack',   stats: ['DRIBBLING', 'SPEED', 'AGILITY'],                     baseLoss: BASE_LOSS, isBase: false },
  { name: '1-on-1 Finishing',       type: 'Attack',   stats: ['FINISHING', 'SHOOTING', 'DRIBBLING'],                baseLoss: BASE_LOSS, isBase: false },
  { name: 'Use Your Head',          type: 'Defence',  stats: ['POSITIONING', 'PASSING', 'HEADING', 'CREATIVITY'],   baseLoss: BASE_LOSS, isBase: false },

  // --- Defence ---
  { name: 'Piggy in the Middle',    type: 'Defence',  stats: ['FITNESS', 'PASSING', 'TACKLING', 'POSITIONING', 'AGGRESSION'], baseLoss: BASE_LOSS, isBase: true },
  { name: 'Press the Play',         type: 'Defence',  stats: ['AGGRESSION', 'TACKLING', 'MARKING', 'POSITIONING'],  baseLoss: BASE_LOSS, isBase: true },
  { name: 'Defensive Line',         type: 'Defence',  stats: ['MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'],      baseLoss: BASE_LOSS, isBase: true },
  { name: 'Video Analysis',         type: 'Defence',  stats: ['CREATIVITY', 'POSITIONING', 'BRAVERY'],              baseLoss: BASE_LOSS, isBase: true },
  { name: 'Stop the Attacker',      type: 'Defence',  stats: ['STRENGTH', 'MARKING', 'BRAVERY', 'DRIBBLING', 'TACKLING'], baseLoss: BASE_LOSS, isBase: false },
  { name: 'Defending Crosses',      type: 'Defence',  stats: ['HEADING', 'POSITIONING', 'MARKING'],                 baseLoss: BASE_LOSS, isBase: false },
  { name: 'Hold the Line',          type: 'Defence',  stats: ['POSITIONING', 'BRAVERY', 'MARKING'],                 baseLoss: BASE_LOSS, isBase: false },

  // --- Physical ---
  { name: 'Gym',                    type: 'Physical', stats: ['STRENGTH', 'FITNESS'],                               baseLoss: BASE_LOSS, isBase: true },
  { name: 'Sprints',                type: 'Physical', stats: ['FITNESS', 'SPEED', 'DRIBBLING'],                     baseLoss: BASE_LOSS, isBase: true },
  { name: 'Long Run',               type: 'Physical', stats: ['FITNESS', 'SPEED'],                                  baseLoss: BASE_LOSS, isBase: true },
  { name: 'Stretch',                type: 'Physical', stats: ['FITNESS', 'AGILITY'],                                baseLoss: BASE_LOSS, isBase: true },
  { name: 'Hurdles',                type: 'Physical', stats: ['SPEED', 'AGILITY', 'PASSING'],                       baseLoss: BASE_LOSS, isBase: true },
  { name: 'Warm-Up',                type: 'Physical', stats: ['FITNESS', 'AGILITY', 'SPEED'],                       baseLoss: BASE_LOSS, isBase: false },
  { name: 'Carioca with Ladders',   type: 'Physical', stats: ['AGILITY', 'SPEED', 'FITNESS'],                       baseLoss: BASE_LOSS, isBase: false },
  { name: 'Shuttle Runs',           type: 'Physical', stats: ['SPEED', 'FITNESS'],                                  baseLoss: BASE_LOSS, isBase: false },
  { name: 'Hurdle Jumps',           type: 'Physical', stats: ['AGILITY', 'SPEED', 'STRENGTH'],                      baseLoss: BASE_LOSS, isBase: false },
];
