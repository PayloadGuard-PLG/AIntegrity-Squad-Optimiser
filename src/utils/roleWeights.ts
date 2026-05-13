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
  ST:  {
    essential: ['POSITIONING', 'HEADING', 'PASSING', 'DRIBBLING', 'SHOOTING', 'FINISHING', 'STRENGTH', 'SPEED', 'CREATIVITY'],
    secondary: ['TACKLING', 'MARKING', 'BRAVERY', 'CROSSING', 'FITNESS', 'AGGRESSION'],
  },
  GK:  {
    essential: ['REFLEXES', 'ANTICIPATION', 'RUSHING OUT', 'COMMUNICATION', 'KICKING', 'AERIAL REACH', 'FITNESS'],
    secondary: ['AGILITY', 'THROWING', 'PUNCHING', 'CONCENTRATION', 'STRENGTH', 'AGGRESSION', 'SPEED', 'CREATIVITY'],
  },
  AMC: {
    essential: ['HEADING', 'PASSING', 'DRIBBLING', 'SHOOTING', 'FINISHING', 'FITNESS', 'SPEED', 'CREATIVITY'],
    secondary: ['TACKLING', 'MARKING', 'POSITIONING', 'BRAVERY', 'CROSSING', 'STRENGTH', 'AGGRESSION'],
  },
  AML: {
    essential: ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING', 'FITNESS', 'SPEED', 'CREATIVITY'],
    secondary: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'STRENGTH', 'AGGRESSION'],
  },
  AMR: {
    essential: ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING', 'FITNESS', 'SPEED', 'CREATIVITY'],
    secondary: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'STRENGTH', 'AGGRESSION'],
  },
  ML:  {
    essential: ['POSITIONING', 'PASSING', 'DRIBBLING', 'CROSSING', 'FITNESS', 'SPEED', 'CREATIVITY'],
    secondary: ['TACKLING', 'MARKING', 'HEADING', 'BRAVERY', 'SHOOTING', 'FINISHING', 'STRENGTH', 'AGGRESSION'],
  },
  MR:  {
    essential: ['POSITIONING', 'PASSING', 'DRIBBLING', 'CROSSING', 'FITNESS', 'SPEED', 'CREATIVITY'],
    secondary: ['TACKLING', 'MARKING', 'HEADING', 'BRAVERY', 'SHOOTING', 'FINISHING', 'STRENGTH', 'AGGRESSION'],
  },
  MC:  {
    essential: ['TACKLING', 'MARKING', 'POSITIONING', 'BRAVERY', 'PASSING', 'DRIBBLING', 'FITNESS', 'STRENGTH', 'SPEED', 'CREATIVITY'],
    secondary: ['HEADING', 'CROSSING', 'SHOOTING', 'FINISHING', 'AGGRESSION'],
  },
  DMC: {
    essential: ['TACKLING', 'MARKING', 'POSITIONING', 'HEADING', 'BRAVERY', 'PASSING', 'FITNESS', 'STRENGTH', 'AGGRESSION', 'CREATIVITY'],
    secondary: ['DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING', 'SPEED'],
  },
  DC:  {
    essential: ['POSITIONING', 'HEADING', 'FITNESS', 'STRENGTH', 'AGGRESSION'],
    secondary: ['TACKLING', 'MARKING', 'BRAVERY', 'PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING', 'SPEED', 'CREATIVITY'],
  },
  DL:  {
    essential: ['TACKLING', 'MARKING', 'POSITIONING', 'BRAVERY', 'CROSSING', 'FITNESS', 'AGGRESSION', 'SPEED'],
    secondary: ['HEADING', 'PASSING', 'DRIBBLING', 'SHOOTING', 'FINISHING', 'STRENGTH', 'CREATIVITY'],
  },
  DR:  {
    essential: ['TACKLING', 'MARKING', 'POSITIONING', 'BRAVERY', 'CROSSING', 'FITNESS', 'AGGRESSION', 'SPEED'],
    secondary: ['HEADING', 'PASSING', 'DRIBBLING', 'SHOOTING', 'FINISHING', 'STRENGTH', 'CREATIVITY'],
  },
};

/**
 * For each role R1 and each role R2 adjacent to it, lists the stats that
 * become white when R2 is added to a player who already has R1.
 * i.e. ROLE_CONSTRAINTS[R2].essential − ROLE_CONSTRAINTS[R1].essential
 * GK is excluded (GK cannot combine with outfield roles).
 */
export const ROLE_CROSSOVER_WHITES: Record<string, Record<string, string[]>> = (() => {
  const result: Record<string, Record<string, string[]>> = {};
  for (const [r1, neighbours] of Object.entries(ADJACENCY_MAP)) {
    if (r1 === 'GK' || !ROLE_CONSTRAINTS[r1]) continue;
    result[r1] = {};
    for (const r2 of neighbours) {
      if (r2 === 'GK' || !ROLE_CONSTRAINTS[r2]) continue;
      const base = new Set(ROLE_CONSTRAINTS[r1].essential);
      result[r1][r2] = ROLE_CONSTRAINTS[r2].essential.filter(s => !base.has(s));
    }
  }
  return result;
})();

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
