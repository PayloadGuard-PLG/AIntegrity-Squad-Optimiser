import { projectOvr, getTierCost } from './ovrProjector';
import { Player } from '../database/playerSchema';
import { ManagerProfile, InvestmentPlan, TierName, DrillSession, GameProfile } from '../types/resources';

/**
 * Produces a full investment plan for a single player given the manager's profile
 * and a list of drill sessions to run.
 *
 * Drill sessions are always applied BEFORE tier upgrade (drills-first rule).
 */
export function planPlayerInvestment(
  player: Player,
  profile: ManagerProfile,
  drillSessions: DrillSession[],
  gameProfile: GameProfile,
  targetTier: TierName | null = null
): InvestmentPlan {
  const warnings: string[] = [];

  if (drillSessions.length === 0) {
    warnings.push('No drill sessions provided — add drills to generate a projection.');
  }

  if (targetTier) {
    const cost = getTierCost(targetTier);
    if (cost > profile.tierPoints) {
      warnings.push(
        `Not enough tier points for ${targetTier}: need ${cost}, have ${profile.tierPoints}.`
      );
    }
  }

  const { steps, finalOvr, warnings: projectionWarnings } = projectOvr(
    player,
    drillSessions,
    profile.talentTier,
    profile.drillLevel,
    targetTier,
    profile.greens,
    profile.twoxAdActive,
    gameProfile
  );

  warnings.push(...projectionWarnings);

  const totalOvrGain = Number((finalOvr - player.overall).toFixed(1));

  const drillSummary = drillSessions.length > 0
    ? drillSessions.map(s => `${s.drillName} ×${s.sessionCount}`).join(', ')
    : 'none';

  const tierSummary = targetTier ? ` → ${targetTier} tier` : '';
  const greenSummary = profile.greens > 0 ? ` + ${profile.greens} greens (condition)` : '';

  const recommendation =
    `Run drills first (${drillSummary})${tierSummary}${greenSummary}. ` +
    `Projected OVR: ${player.overall} → ${finalOvr} (+${totalOvrGain}).`;

  const resourceLines = [
    drillSessions.length > 0 ? `${drillSessions.reduce((s, d) => s + d.sessionCount, 0)} sessions` : null,
    targetTier ? `${getTierCost(targetTier)} tier points` : null,
    profile.greens > 0 ? `${profile.greens} greens` : null,
  ].filter(Boolean);

  return {
    player: { name: player.name, currentOvr: player.overall },
    steps,
    finalOvr,
    totalOvrGain,
    totalResourceCost: resourceLines.join(' + ') || 'No resources',
    recommendation,
    warnings,
  };
}

/**
 * Compares investment plans across multiple players using a shared drill set.
 * Returns players ranked by projected OVR gain.
 */
export function compareInvestmentScenarios(
  players: Player[],
  profile: ManagerProfile,
  drillSessions: DrillSession[],
  gameProfile: GameProfile,
  targetTier: TierName | null = null
): { ranked: { player: Player; plan: InvestmentPlan }[] } {
  const results = players.map(player => ({
    player,
    plan: planPlayerInvestment(player, profile, drillSessions, gameProfile, targetTier),
  }));

  results.sort((a, b) => b.plan.totalOvrGain - a.plan.totalOvrGain);
  return { ranked: results };
}
