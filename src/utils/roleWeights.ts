/**
* roleWeights.ts: Final Squad Position Logic
* Supports multi-role merging for outfielders while locking GK functionality.
*/

export const ADJACENCY_MAP: Record<string, string[]> = {
  'GK': [], 
  'DC': ['DL', 'DR', 'DMC'],
  'DL': ['DC', 'ML', 'DMC'],
  'DR': ['DC', 'MR', 'DMC'],
  'DMC': ['DC', 'DL', 'DR', 'MC', 'ML', 'MR'],
  'MC': ['DMC', 'ML', 'MR', 'AMC', 'DL', 'DR'],
  'ML': ['DL', 'DMC', 'MC', 'AML'],
  'MR': ['DR', 'DMC', 'MC', 'AMR'],
  'AMC': ['MC', 'AML', 'AMR', 'ST'],
  'AML': ['ML', 'AMC', 'ST'],
  'AMR': ['MR', 'AMC', 'ST'],
  'ST': ['AMC', 'AML', 'AMR']
};

export const ROLE_CONSTRAINTS: Record<string, { essential: string[]; secondary: string[] }> = {
  ST: { essential: ['FINISHING', 'SHOOTING', 'DRIBBLING', 'PASSING', 'POSITIONING', 'HEADING'], secondary: ['STRENGTH', 'SPEED', 'CREATIVITY'] },
  GK: { essential: ['REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION'], secondary: ['THROWING', 'KICKING', 'PUNCHING', 'AERIAL REACH', 'FITNESS'] },
  AMC: { essential: ['PASSING', 'DRIBBLING', 'SHOOTING', 'FINISHING', 'HEADING'], secondary: ['SPEED', 'CREATIVITY', 'FITNESS'] },
  AML: { essential: ['CROSSING', 'DRIBBLING', 'PASSING', 'SHOOTING', 'FINISHING'], secondary: ['FITNESS', 'SPEED', 'CREATIVITY'] },
  AMR: { essential: ['CROSSING', 'DRIBBLING', 'PASSING', 'SHOOTING', 'FINISHING'], secondary: ['FITNESS', 'SPEED', 'CREATIVITY'] },
  ML: { essential: ['CROSSING', 'PASSING', 'DRIBBLING', 'POSITIONING'], secondary: ['FITNESS', 'SPEED', 'CREATIVITY'] },
  MR: { essential: ['CROSSING', 'PASSING', 'DRIBBLING', 'POSITIONING'], secondary: ['FITNESS', 'SPEED', 'CREATIVITY'] },
  MC: { essential: ['PASSING', 'DRIBBLING', 'SHOOTING', 'TACKLING', 'POSITIONING', 'BRAVERY'], secondary: ['FITNESS', 'STRENGTH', 'SPEED', 'CREATIVITY'] },
  DMC: { essential: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'PASSING'], secondary: ['FITNESS', 'STRENGTH', 'AGGRESSION'] },
  DC: { essential: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'], secondary: ['STRENGTH', 'AGGRESSION'] },
  DL: { essential: ['TACKLING', 'MARKING', 'POSITIONING', 'BRAVERY', 'CROSSING'], secondary: ['FITNESS', 'AGGRESSION', 'SPEED'] },
  DR: { essential: ['TACKLING', 'MARKING', 'POSITIONING', 'BRAVERY', 'CROSSING'], secondary: ['FITNESS', 'AGGRESSION', 'SPEED'] }
};

export function validateRoleAdjacency(roles: string[]): boolean {
  if (roles.length <= 1) return true;
  const primary = roles[0].toUpperCase();
  if (primary === 'GK') return false;
  const validAdjacents = ADJACENCY_MAP[primary] || [];
  return roles.slice(1, 3).every(sec => {
    const s = sec.toUpperCase();
    return s !== 'GK' && validAdjacents.includes(s);
  });
}

export function isEssentialGain(roles: string[], skillName: string): boolean {
  const normalizedSkill = skillName.toUpperCase();
  return roles.slice(0, 3).some(role => {
    const roleData = ROLE_CONSTRAINTS[role.toUpperCase()];
    return roleData?.essential.includes(normalizedSkill) || roleData?.secondary.includes(normalizedSkill);
  });
}
