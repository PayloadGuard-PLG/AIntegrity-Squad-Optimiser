export interface Drill {
    name: string;
    type: 'Attack' | 'Defence' | 'Physical';
    stats: string[];
    baseLoss: number; 
}

export const DRILL_LIST: Drill[] = [
    { name: 'Skill Drill', type: 'Attack', stats: ['CREATIVITY', 'DRIBBLING', 'PASSING'], baseLoss: 1.5 },
    { name: 'Shooting Technique', type: 'Attack', stats: ['SHOOTING', 'STRENGTH', 'REFLEXES'], baseLoss: 2.25 },
    { name: 'Fast Counter-Attacks', type: 'Attack', stats: ['CROSSING', 'PASSING', 'FINISHING', 'CREATIVITY'], baseLoss: 3.0 },
    { name: 'Pass, Go & Shoot', type: 'Attack', stats: ['PASSING', 'DRIBBLING', 'SHOOTING'], baseLoss: 2.25 },
    { name: 'Wing Play', type: 'Attack', stats: ['CROSSING', 'FINISHING', 'SHOOTING', 'HEADING'], baseLoss: 3.0 },
    { name: 'Piggy in the Middle', type: 'Defence', stats: ['FITNESS', 'PASSING', 'TACKLING', 'POSITIONING'], baseLoss: 1.5 },
    { name: 'Press the Play', type: 'Defence', stats: ['AGGRESSION', 'TACKLING', 'MARKING', 'POSITIONING'], baseLoss: 2.25 },
    { name: 'Defensive Line', type: 'Defence', stats: ['MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'], baseLoss: 1.5 },
    { name: 'Video Analysis', type: 'Defence', stats: ['CREATIVITY', 'POSITIONING', 'BRAVERY'], baseLoss: 0.75 },
    { name: 'Gym', type: 'Physical', stats: ['STRENGTH', 'FITNESS'], baseLoss: 4.5 },
    { name: 'Sprints', type: 'Physical', stats: ['FITNESS', 'SPEED', 'DRIBBLING'], baseLoss: 2.25 },
    { name: 'Long Run', type: 'Physical', stats: ['FITNESS', 'STAMINA', 'SPEED'], baseLoss: 3.0 },
    { name: 'Stretch', type: 'Physical', stats: ['FITNESS', 'STAMINA', 'AGILITY'], baseLoss: 0.75 },
    { name: 'Hurdles', type: 'Physical', stats: ['SPEED', 'AGILITY', 'PASSING'], baseLoss: 1.5 }
];
