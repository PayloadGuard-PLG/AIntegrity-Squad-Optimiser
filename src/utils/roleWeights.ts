export const OUTFIELD_STATS = [
  'SHOOTING', 'PASSING', 'CROSSING', 'DRIBBLING', 'FINISHING', 'HEADING',
  'TACKLING', 'MARKING', 'POSITIONING', 'BRAVERY', 'AGGRESSION', 'STRENGTH',
  'SPEED', 'FITNESS', 'CREATIVITY',
] as const;

export const GK_STATS = [
  'REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION',
  'THROWING', 'KICKING', 'PUNCHING', 'AERIAL REACH', 'CONCENTRATION',
] as const;

// All 15 stats shown on a GK player form: 10 essentials + 5 secondaries.
export const GK_STATS_ALL = [
  ...GK_STATS,
  'FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY',
] as const;

// DEF / ATT / PHY column groupings for the stat grid display.
export const STAT_COLUMNS = {
  DEF: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION'],
  ATT: ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING', 'THROWING', 'KICKING', 'PUNCHING', 'AERIAL REACH', 'CONCENTRATION'],
  PHY: ['FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY'],
} as const;

export const COL_COLORS = { DEF: '#4A7FC1', ATT: '#7C3AED', PHY: '#C05621' } as const;

export const ADJACENCY_MAP: Record<string, string[]> = {
  'GK':  [],
  'DC':  ['DL', 'DR', 'DMC'],
  'DL':  ['DC', 'ML', 'DMC'],
  'DR':  ['DC', 'MR', 'DMC'],
  'DMC': ['DC', 'DL', 'DR', 'MC', 'ML', 'MR'],
  'MC':  ['DMC', 'ML', 'MR', 'AMC', 'DL', 'DR'],
  'ML':  ['DL', 'DMC', 'MC', 'AML'],
  'MR':  ['DR', 'DMC', 'MC', 'AMR'],
  'AMC': ['MC', 'AML', 'AMR', 'ST'],
  'AML': ['ML', 'AMC', 'ST'],
  'AMR': ['MR', 'AMC', 'ST'],
  'ST':  ['AMC', 'AML', 'AMR'],
};

// essential = white stats (full XP efficiency)
// secondary = grey stats (×0.5 XP efficiency per profile.greyWeightMultiplier)
export const ROLE_CONSTRAINTS: Record<string, { essential: string[]; secondary: string[] }> = {
  ST:  { essential: ['FINISHING', 'SHOOTING', 'DRIBBLING', 'PASSING', 'POSITIONING', 'HEADING'], secondary: ['STRENGTH', 'SPEED', 'CREATIVITY'] },
  GK:  { essential: ['REFLEXES', 'AGILITY', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION', 'THROWING', 'KICKING', 'PUNCHING', 'AERIAL REACH', 'CONCENTRATION'], secondary: ['FITNESS', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY'] },
  AMC: { essential: ['PASSING', 'DRIBBLING', 'SHOOTING', 'FINISHING', 'HEADING'], secondary: ['SPEED', 'CREATIVITY', 'FITNESS'] },
  AML: { essential: ['CROSSING', 'DRIBBLING', 'PASSING', 'SHOOTING', 'FINISHING'], secondary: ['FITNESS', 'SPEED', 'CREATIVITY'] },
  AMR: { essential: ['CROSSING', 'DRIBBLING', 'PASSING', 'SHOOTING', 'FINISHING'], secondary: ['FITNESS', 'SPEED', 'CREATIVITY'] },
  ML:  { essential: ['CROSSING', 'PASSING', 'DRIBBLING', 'POSITIONING'], secondary: ['FITNESS', 'SPEED', 'CREATIVITY'] },
  MR:  { essential: ['CROSSING', 'PASSING', 'DRIBBLING', 'POSITIONING'], secondary: ['FITNESS', 'SPEED', 'CREATIVITY'] },
  MC:  { essential: ['PASSING', 'DRIBBLING', 'SHOOTING', 'TACKLING', 'POSITIONING', 'BRAVERY'], secondary: ['FITNESS', 'STRENGTH', 'SPEED', 'CREATIVITY'] },
  DMC: { essential: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'PASSING'], secondary: ['FITNESS', 'STRENGTH', 'AGGRESSION'] },
  DC:  { essential: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY'], secondary: ['STRENGTH', 'AGGRESSION'] },
  DL:  { essential: ['TACKLING', 'MARKING', 'POSITIONING', 'BRAVERY', 'CROSSING'], secondary: ['FITNESS', 'AGGRESSION', 'SPEED'] },
  DR:  { essential: ['TACKLING', 'MARKING', 'POSITIONING', 'BRAVERY', 'CROSSING'], secondary: ['FITNESS', 'AGGRESSION', 'SPEED'] },
};

export function validateRoleAdjacency(roles: string[]): boolean {
  if (roles.length <= 1) return true;
  const primary = roles[0].toUpperCase();
  if (primary === 'GK') return false;
  const accepted = [primary];
  for (const role of roles.slice(1, 3)) {
    const r = role.toUpperCase();
    if (r === 'GK') return false;
    if (!accepted.some(a => ADJACENCY_MAP[a]?.includes(r))) return false;
    accepted.push(r);
  }
  return true;
}

/**
 * Returns true only if the skill is in the ESSENTIAL (white) list for any of
 * the player's roles. Secondary (grey) stats return false — they receive ×0.5
 * XP efficiency, not full white efficiency.
 */
export function isWhiteStat(roles: string[], skillName: string): boolean {
  const normalized = skillName.toUpperCase();
  return roles.slice(0, 3).some(role => {
    const roleData = ROLE_CONSTRAINTS[role.toUpperCase()];
    return roleData?.essential.includes(normalized) ?? false;
  });
}

/** Backward-compatible alias — prefer isWhiteStat in new code. */
export const isEssentialGain = isWhiteStat;

/**
 * Returns ALL stat keys (white + grey) for a player's roles (union, deduplicated).
 */
export function getAllStatKeys(roles: string[]): string[] {
  const keys = new Set<string>();
  for (const role of roles.slice(0, 3)) {
    const data = ROLE_CONSTRAINTS[role.toUpperCase()];
    if (data) {
      data.essential.forEach(s => keys.add(s));
      data.secondary.forEach(s => keys.add(s));
    }
  }
  return Array.from(keys);
}

/**
 * Returns all white (essential) stat keys for a player's roles (union, deduplicated).
 */
export function getWhiteStatKeys(roles: string[]): string[] {
  const keys = new Set<string>();
  for (const role of roles.slice(0, 3)) {
    const roleData = ROLE_CONSTRAINTS[role.toUpperCase()];
    if (roleData) {
      for (const stat of roleData.essential) keys.add(stat);
    }
  }
  return Array.from(keys);
}
