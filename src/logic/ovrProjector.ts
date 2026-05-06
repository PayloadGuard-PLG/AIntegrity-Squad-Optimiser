import { TIER_DATA } from '../utils/math';
import { estimateOvrGainFromCoach } from '../utils/coachMath';
import { isEssentialGain } from '../utils/roleWeights';
import { Coach, TierName, InvestmentStep } from '../types/resources';
import { Player } from '../database/playerSchema';

export function getTierData(tierName: TierName): { bonus: number; pointsRequired: number } {
  return TIER_DATA.find(t => t.name === tierName) ?? { bonus: 0, pointsRequired: 0 };
}

export function getTierBonus(tierName: TierName): number {
  return getTierData(tierName).bonus;
}

export function getTierCost(tierName: TierName): number {
  return getTierData(tierName).pointsRequired;
}

/**
 * Partitions the player's stats into white (role-essential) and grey
 * based on the coach card's attribute list.
 */
function partitionStats(
  player: Player,
  coachAttributes: string[]
): { whiteStats: number[]; greyStats: number[] } {
  const whiteStats: number[] = [];
  const greyStats: number[] = [];

  for (const attr of coachAttributes) {
    const normalized = attr.toUpperCase();
    const statValue = player.stats[normalized] ?? player.stats[attr] ?? 100;
    if (isEssentialGain(player.role, normalized)) {
      whiteStats.push(statValue);
    } else {
      greyStats.push(statValue);
    }
  }
  return { whiteStats, greyStats };
}

/**
 * Applies a set of coaches to the player in order and returns OVR gain + step log.
 * Always call this BEFORE tier upgrades (coaches-first rule).
 */
export function applyCoachesToPlayer(
  player: Player,
  coaches: Coach[]
): { totalOvrGain: number; steps: InvestmentStep[] } {
  const steps: InvestmentStep[] = [];
  let runningOvr = player.overall;

  for (const coach of coaches) {
    const { whiteStats, greyStats } = partitionStats(player, coach.attributes);
    const ovrGain = estimateOvrGainFromCoach(
      coach.multiplier,
      coach.sessionType,
      player.age,
      whiteStats,
      greyStats
    );

    const ovrBefore = runningOvr;
    runningOvr = Number((runningOvr + ovrGain).toFixed(1));

    steps.push({
      action: 'coach',
      description: `${coach.type} ×${coach.multiplier} ${coach.sessionType} (${coach.source}) — trains: ${coach.attributes.join(', ')}`,
      ovrBefore,
      ovrAfter: runningOvr,
      resourcesUsed: coach.cost.currency === 'free'
        ? 'FREE'
        : `${coach.cost.amount} ${coach.cost.currency}`,
    });
  }

  return { totalOvrGain: Number((runningOvr - player.overall).toFixed(1)), steps };
}

/**
 * Full OVR projection chain:
 *   1. Coaches (always first)
 *   2. Tier upgrade (if target tier supplied and points available)
 *   3. Greens
 *
 * Returns ordered steps and the final projected OVR.
 */
export function projectOvr(
  player: Player,
  coaches: Coach[],
  targetTier: TierName | null,
  greens: number,
  isPremiumSponsor: boolean
): { steps: InvestmentStep[]; finalOvr: number; warnings: string[] } {
  const steps: InvestmentStep[] = [];
  const warnings: string[] = [];
  let currentOvr = player.overall;

  // Step 1 — Coaches first
  if (coaches.length > 0) {
    const { steps: coachSteps, totalOvrGain } = applyCoachesToPlayer(player, coaches);
    steps.push(...coachSteps);
    currentOvr = Number((currentOvr + totalOvrGain).toFixed(1));
  } else {
    warnings.push('No coaches provided — add coaches before tiering for best results.');
  }

  // Step 2 — Tier upgrade
  if (targetTier && targetTier !== player.tier && targetTier !== 'None') {
    const tierBonus = getTierBonus(targetTier);
    const ovrBefore = currentOvr;
    currentOvr = Number((currentOvr + tierBonus).toFixed(1));
    steps.push({
      action: 'tier',
      description: `Tier up to ${targetTier} (+${tierBonus} OVR bonus)`,
      ovrBefore,
      ovrAfter: currentOvr,
      resourcesUsed: `${getTierCost(targetTier)} tier points`,
    });
  }

  // Step 3 — Greens
  if (greens > 0) {
    const greenEfficiency = isPremiumSponsor ? 1.3 : 1.0;
    const ovrFromGreens = Number(((greens / 15) * greenEfficiency).toFixed(1));
    const ovrBefore = currentOvr;
    currentOvr = Number((currentOvr + ovrFromGreens).toFixed(1));
    steps.push({
      action: 'greens',
      description: `${greens} greens${isPremiumSponsor ? ' (Premium ×1.3)' : ''}`,
      ovrBefore,
      ovrAfter: currentOvr,
      resourcesUsed: `${greens} greens`,
    });
  }

  if (player.age > 25) {
    warnings.push(`Slow trainer (age ${player.age}) — OVR gains are significantly reduced.`);
  }

  return { steps, finalOvr: currentOvr, warnings };
}
