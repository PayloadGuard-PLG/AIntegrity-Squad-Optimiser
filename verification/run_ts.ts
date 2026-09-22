/**
 * verification/run_ts.ts — TypeScript engine subprocess runner.
 * Called by tests/proofs/test_ts_equivalence.py as a persistent subprocess.
 *
 * Protocol: one JSON line per request on stdin → one JSON line result on stdout.
 *   in:  { "fn": "<name>", "args": <array or object> }
 *   out: { "result": <value> }
 *        { "error": "<message>" }   (on dispatch failure)
 *
 * Args schema per function (matches engine_pure.py calling convention):
 *   coachBudgetPerStat   [sessions: number, numStats: number]
 *   statGainFromBudget   [startStat: number, budget: number, mult: number]
 *   ovrFromStats         [[...statValues: number[]]]
 *   combinedMultiplier   [{ age, talent, isWhite, starsGained, twoxAd, drillLevelMult }]
 *   applySeasonDecay     [[...statValues: number[]], levels: number, decayPerLevel: number]
 *   isTrainingLocked     [baseOvr: number]
 *   conditionDrainPct    [drillIntensity: string, fanLevel: number]
 *
 * Run standalone: npx tsx verification/run_ts.ts
 * Stays alive reading lines until stdin closes.
 */

import * as readline from 'readline';
import {
  coachBudgetPerStat,
  statGainFromBudget,
  ovrFromStats,
  combinedMultiplier,
  applySeasonDecay,
  isTrainingLocked,
  conditionDrainPct,
} from '../src/engine/engineMath';
import gameProfileJson from '../profiles/game_2025.json';
import type { GameProfile, TierName } from '../src/types/resources';
import type { PlayerPlanningState, PlaystyleLevel } from '../src/types/planning';
import {
  ROLE_CONSTRAINTS, OUTFIELD_STATS, getAllStatKeys, getWhiteStatKeys,
} from '../src/utils/roleWeights';
import { playerRoleError } from '../src/logic/playerScanState';
import {
  availableRoleAdditions,
  previewDeployment,
  previewPlaystyleAssignment,
  previewRoleUnlock,
  previewTierUpgrade,
} from '../src/logic/stateTransitions';
import { PLAYSTYLE_CATALOG } from '../src/data/playstyles';

const stateProfile = gameProfileJson as unknown as GameProfile;

type IntakeRoleState = {
  roles: string[];
  learningRole: { role: string; points: number } | null;
};

function roleStateKey(roles: string[], learningRole: { role: string; points: number } | null): string {
  return `${roles.join('>')}|${learningRole?.role ?? '-'}`;
}

function validEstablishedRoleStates(): string[][] {
  const roles = Object.keys(ROLE_CONSTRAINTS);
  const out: string[][] = [];
  const walk = (prefix: string[]) => {
    if (prefix.length > 0 && playerRoleError({ role: prefix, newRole: null, newRolePoints: 0 }) === null) {
      out.push([...prefix]);
    }
    if (prefix.length >= 3) return;
    for (const role of roles) {
      if (prefix.includes(role)) continue;
      walk([...prefix, role]);
    }
  };
  walk([]);
  return out;
}

function stateTransitionDomain() {
  const roleNames = Object.keys(ROLE_CONSTRAINTS);
  const cards: IntakeRoleState[] = [];
  for (const roles of validEstablishedRoleStates()) {
    cards.push({ roles, learningRole: null });
    if (roles.length >= 3 || roles.includes('GK')) continue;
    for (const role of roleNames) {
      if (roles.includes(role)) continue;
      const candidate = { role, points: 0 };
      if (playerRoleError({ role: roles, newRole: role, newRolePoints: 0 }) === null) {
        cards.push({ roles, learningRole: candidate });
      }
    }
  }

  const keyToId = new Map(cards.map((s, i) => [roleStateKey(s.roles, s.learningRole), i]));
  const dummyStats = Object.fromEntries(OUTFIELD_STATS.map(stat => [stat, 100]));

  const roleEdges = cards.flatMap((card, pre) =>
    availableRoleAdditions(card.roles, card.learningRole).map(newRole => {
      const state: PlayerPlanningState = {
        roles: [...card.roles],
        stats: { ...dummyStats },
        overall: 100,
        tier: 'T3',
        learningRole: card.learningRole ? { ...card.learningRole } : null,
        playstyle: null,
        deployedRole: card.roles[0] ?? null,
      };
      const step = previewRoleUnlock(state, newRole, stateProfile);
      const postCard = {
        roles: step.after.roles,
        learningRole: step.after.learningRole ?? null,
      };
      return {
        pre,
        post: keyToId.get(roleStateKey(postCard.roles, postCard.learningRole)) ?? -1,
        newRole,
        newlyWhite: step.newlyWhite,
        postValid: playerRoleError({
          role: postCard.roles,
          newRole: postCard.learningRole?.role ?? null,
          newRolePoints: postCard.learningRole?.points ?? 0,
        }) === null,
      };
    })
  );

  return {
    roleNames,
    roleStates: cards.map((card, id) => ({
      id,
      roles: card.roles,
      learningRole: card.learningRole,
      whiteStats: getWhiteStatKeys(card.roles),
      statKeys: getAllStatKeys(card.roles),
    })),
    roleEdges,
    outfieldStats: [...OUTFIELD_STATS],
    tierAdditions: stateProfile.tierAttrAdditions,
    statCap: stateProfile.statCap,
    totalAttributeCount: stateProfile.totalAttributeCount,
    playstyles: PLAYSTYLE_CATALOG.map(p => ({ id: p.id, roles: p.compatibleRoles })),
  };
}

function dispatch(fn: string, args: unknown): unknown {
  const a = args as unknown[];
  switch (fn) {
    case 'coachBudgetPerStat': {
      const [sessions, numStats] = a as [number, number];
      return coachBudgetPerStat(sessions, Array.from({ length: numStats }, (_, i) => `s${i}`));
    }
    case 'statGainFromBudget': {
      const [startStat, budget, mult] = a as [number, number, number];
      return statGainFromBudget(startStat, budget, mult);
    }
    case 'ovrFromStats': {
      const vals = a[0] as number[];
      const stats: Record<string, number> = {};
      vals.forEach((v, i) => { stats[`s${i}`] = v; });
      return ovrFromStats(stats);
    }
    case 'combinedMultiplier': {
      return combinedMultiplier(a[0] as Parameters<typeof combinedMultiplier>[0]);
    }
    case 'applySeasonDecay': {
      const [vals, levels, decayPerLevel] = a as [number[], number, number];
      const stats: Record<string, number> = {};
      vals.forEach((v, i) => { stats[`s${i}`] = v; });
      return Object.values(applySeasonDecay(stats, levels, decayPerLevel));
    }
    case 'isTrainingLocked': {
      return isTrainingLocked(a[0] as number);
    }
    case 'conditionDrainPct': {
      return conditionDrainPct(a[0] as string, a[1] as number);
    }
    case 'stateTransitionDomain': {
      return stateTransitionDomain();
    }
    case 'previewStateTransition': {
      const input = a[0] as {
        kind: 'role' | 'tier' | 'playstyle' | 'deployment';
        state: PlayerPlanningState;
        newRole?: string;
        targetTier?: TierName;
        playstyleId?: string;
        level?: PlaystyleLevel;
        deployedRole?: string;
      };
      if (input.kind === 'role') {
        return previewRoleUnlock(input.state, input.newRole!, stateProfile);
      }
      if (input.kind === 'tier') {
        return previewTierUpgrade(input.state, input.targetTier!, stateProfile);
      }
      if (input.kind === 'playstyle') {
        return previewPlaystyleAssignment(input.state, input.playstyleId!, input.level ?? 'Standard');
      }
      return previewDeployment(input.state, input.deployedRole!);
    }
    default:
      throw new Error(`Unknown function: ${fn}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const { fn, args } = JSON.parse(trimmed) as { fn: string; args: unknown };
    process.stdout.write(JSON.stringify({ result: dispatch(fn, args) }) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: String(e) }) + '\n');
  }
});
