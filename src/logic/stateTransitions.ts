import type { Player } from '../database/playerSchema';
import type { GameProfile, TierName } from '../types/resources';
import type {
  PlayerPlanningState,
  StateTransitionResult,
  TierPathStep,
  PlaystyleLevel,
} from '../types/planning';
import { paddedStatSum, exactOvrFromSum } from '../engine/engineMath';
import {
  ROLE_CONSTRAINTS,
  getWhiteStatKeys,
  validateRoleAdjacency,
} from '../utils/roleWeights';
import { getPlaystyleDefinition } from '../data/playstyles';

const TIER_ORDER: TierName[] = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

function exactOvr(
  stats: Record<string, number>,
  fallbackOverall: number,
): number {
  const sum = paddedStatSum(stats, fallbackOverall);
  return sum === null ? fallbackOverall : exactOvrFromSum(sum);
}

function statDeltas(
  before: Record<string, number>,
  after: Record<string, number>,
) {
  return Object.keys(after)
    .filter(key => (before[key] ?? 0) !== after[key])
    .map(key => ({ stat: key, before: before[key] ?? 0, after: after[key] }));
}

export function planningStateFromPlayer(player: Player): PlayerPlanningState {
  return {
    roles: [...player.role],
    stats: { ...player.stats },
    overall: player.overall,
    tier: player.tier,
    playstyle: null,
    deployedRole: player.role[0] ?? null,
  };
}

export function availableRoleAdditions(roles: string[]): string[] {
  if (roles.length >= 3 || roles.includes('GK')) return [];
  return Object.keys(ROLE_CONSTRAINTS)
    .filter(role => role !== 'GK' && !roles.includes(role))
    .filter(role => validateRoleAdjacency([...roles, role]))
    .sort();
}

export function tierPath(
  fromTier: TierName,
  targetTier: TierName,
  profile: GameProfile,
): TierPathStep[] {
  const from = TIER_ORDER.indexOf(fromTier);
  const to = TIER_ORDER.indexOf(targetTier);
  if (from < 0 || to <= from) return [];
  return TIER_ORDER.slice(from + 1, to + 1).map(tier => ({
    tier,
    pointsRequired: profile.tierPointsRequired[tier] ?? 0,
  }));
}

export function previewRoleUnlock(
  state: PlayerPlanningState,
  newRole: string,
  profile: GameProfile,
): StateTransitionResult {
  const role = newRole.toUpperCase();
  if (!ROLE_CONSTRAINTS[role]) throw new Error(`Unknown role: ${role}`);
  if (state.roles.includes(role)) throw new Error(`${role} is already established`);
  if (state.roles.length >= 3) throw new Error('Player already has three established roles');
  if (!validateRoleAdjacency([...state.roles, role])) {
    throw new Error(`${role} is not adjacent to the current role chain`);
  }

  const beforeWhite = getWhiteStatKeys(state.roles);
  const afterRoles = [...state.roles, role];
  const afterWhite = getWhiteStatKeys(afterRoles);
  const newlyWhite = afterWhite.filter(stat => !beforeWhite.includes(stat)).sort();
  const tierAddition = profile.tierAttrAdditions[state.tier] ?? 0;

  const stats = { ...state.stats };
  if (tierAddition > 0) {
    for (const stat of newlyWhite) {
      if (stats[stat] === undefined) continue;
      stats[stat] = Math.min(stats[stat] + tierAddition, profile.statCap);
    }
  }

  const after: PlayerPlanningState = {
    ...state,
    roles: afterRoles,
    stats,
    overall: exactOvr(stats, state.overall),
  };

  return {
    kind: 'role',
    label: `Establish ${role}`,
    before: state,
    after,
    deltas: statDeltas(state.stats, stats),
    newlyWhite,
    evidence: 'confirmed',
    gameReversible: false,
    notes: [
      tierAddition > 0
        ? `Newly-white stats inherit the existing ${state.tier} cumulative tier bonus (+${tierAddition}) immediately.`
        : 'T0 has no tier bonus to inherit; only the white/grey mask changes.',
      'The optimiser preview is discardable; the source-game role is permanent once established.',
    ],
  };
}

export function previewTierUpgrade(
  state: PlayerPlanningState,
  targetTier: TierName,
  profile: GameProfile,
): StateTransitionResult {
  const from = TIER_ORDER.indexOf(state.tier);
  const to = TIER_ORDER.indexOf(targetTier);
  if (from < 0 || to <= from) {
    throw new Error(`Target tier ${targetTier} must be above current tier ${state.tier}`);
  }

  const currentAddition = profile.tierAttrAdditions[state.tier] ?? 0;
  const targetAddition = profile.tierAttrAdditions[targetTier] ?? 0;
  const increment = targetAddition - currentAddition;
  const white = new Set(getWhiteStatKeys(state.roles));
  const stats = { ...state.stats };

  for (const stat of Object.keys(stats)) {
    if (!white.has(stat)) continue;
    stats[stat] = Math.min(stats[stat] + increment, profile.statCap);
  }

  const after: PlayerPlanningState = {
    ...state,
    tier: targetTier,
    stats,
    overall: exactOvr(stats, state.overall),
  };

  const path = tierPath(state.tier, targetTier, profile);
  return {
    kind: 'tier',
    label: `${state.tier} → ${targetTier}`,
    before: state,
    after,
    deltas: statDeltas(state.stats, stats),
    newlyWhite: [],
    evidence: 'confirmed',
    gameReversible: false,
    notes: [
      `+${increment} to each of ${white.size} white stats.`,
      path.length > 0
        ? `Tier-point path: ${path.map(p => `${p.tier} ${p.pointsRequired}pt`).join(' · ')}.`
        : 'No tier-point path generated.',
      'Gem top-up exchange rates are not encoded here; the page reports tier-point requirements only.',
      'The optimiser preview is discardable; the source-game tier cannot be reduced after purchase.',
    ],
  };
}

export function previewPlaystyleAssignment(
  state: PlayerPlanningState,
  playstyleId: string,
  level: PlaystyleLevel = 'Standard',
): StateTransitionResult {
  const definition = getPlaystyleDefinition(playstyleId);
  if (!definition) throw new Error(`Unknown or unobserved playstyle: ${playstyleId}`);

  const compatibleOwned = state.roles.filter(role => definition.compatibleRoles.includes(role));
  const after: PlayerPlanningState = {
    ...state,
    playstyle: { id: definition.id, level },
  };

  return {
    kind: 'playstyle',
    label: `${definition.name} · ${level}`,
    before: state,
    after,
    deltas: [],
    newlyWhite: [],
    evidence: 'observed',
    gameReversible: false,
    notes: [
      compatibleOwned.length > 0
        ? `Compatible established roles: ${compatibleOwned.join(', ')}.`
        : `No current established role is compatible; observed compatible roles are ${definition.compatibleRoles.join(', ')}.`,
      'Only position compatibility and displayed level multiplier are modelled. Match-outcome effect is not converted into goals or win probability.',
      'The optimiser preview is discardable; the source-game playstyle is permanent once learned.',
    ],
  };
}

export function previewDeployment(
  state: PlayerPlanningState,
  deployedRole: string,
): StateTransitionResult {
  const role = deployedRole.toUpperCase();
  if (!state.roles.includes(role)) throw new Error(`${role} is not an established role for this player`);

  const definition = state.playstyle ? getPlaystyleDefinition(state.playstyle.id) : null;
  const active = definition ? definition.compatibleRoles.includes(role) : false;
  const after: PlayerPlanningState = { ...state, deployedRole: role };

  return {
    kind: 'deployment',
    label: `Deploy at ${role}`,
    before: state,
    after,
    deltas: [],
    newlyWhite: [],
    evidence: definition ? 'observed' : 'confirmed',
    gameReversible: true,
    notes: definition
      ? [`${definition.name} is ${active ? 'ACTIVE' : 'INACTIVE'} at ${role}.`]
      : ['No named playstyle selected in this preview.'],
  };
}
