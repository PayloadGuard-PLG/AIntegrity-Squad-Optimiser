import { planPlayerInvestment } from './investmentEngine';
import { Player } from '../database/playerSchema';
import { ManagerProfile, ScenarioComparison, ScenarioResult, TierName } from '../types/resources';

/**
 * Compares multiple players competing for the SAME resource pool.
 * Each scenario is evaluated independently; ranks by projected OVR gain.
 * Returns the top recommendation with a human-readable reasoning string.
 */
export function compareInvestmentScenarios(
  players: Player[],
  profile: ManagerProfile,
  targetTier: TierName | null = null
): ScenarioComparison {
  const results: ScenarioResult[] = players.map(player => {
    const plan = planPlayerInvestment(player, profile, targetTier);
    return {
      playerName: player.name,
      currentOvr: player.overall,
      projectedOvr: plan.finalOvr,
      ovrGain: plan.totalOvrGain,
      plan,
      rank: 0,
    };
  });

  // Sort descending by OVR gain
  results.sort((a, b) => b.ovrGain - a.ovrGain);
  results.forEach((r, i) => { r.rank = i + 1; });

  const best = results[0];
  const second = results[1];

  let reasoning = `${best.playerName} yields the highest OVR gain (+${best.ovrGain}) from these resources`;

  if (second) {
    reasoning += `, vs +${second.ovrGain} for ${second.playerName}`;
  }

  if (best.plan.warnings.length > 0) {
    reasoning += `. Note: ${best.plan.warnings[0]}`;
  }

  reasoning += '.';

  return {
    results,
    recommendedPlayer: best.playerName,
    reasoning,
  };
}
