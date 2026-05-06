import { projectOvr, getTierCost } from './ovrProjector';
import { Player } from '../database/playerSchema';
import { ManagerProfile, InvestmentPlan, TierName, Coach } from '../types/resources';

/**
 * Filters the manager's coach list based on their style:
 *   FTP   — owned coaches only (no store purchases)
 *   Hybrid — include store coaches within storeBudget
 *   PTW   — include all coaches regardless of cost
 */
function filterCoachesByStyle(profile: ManagerProfile): Coach[] {
  if (profile.style === 'FTP') {
    return profile.coaches.filter(c => c.source !== 'Store');
  }
  if (profile.style === 'Hybrid') {
    let spent = 0;
    return profile.coaches.filter(c => {
      if (c.source !== 'Store') return true;
      if (c.cost.currency === 'free') return true;
      const budget = profile.storeBudget ?? 0;
      if (spent + c.cost.amount <= budget) {
        spent += c.cost.amount;
        return true;
      }
      return false;
    });
  }
  // PTW: all coaches
  return profile.coaches;
}

/**
 * Produces a full investment plan for a single player given the manager's resources.
 * Enforces the "coaches first, ALWAYS" rule — tier and greens are applied after coaches.
 */
export function planPlayerInvestment(
  player: Player,
  profile: ManagerProfile,
  targetTier: TierName | null = null
): InvestmentPlan {
  const availableCoaches = filterCoachesByStyle(profile);
  const warnings: string[] = [];

  if (availableCoaches.length === 0 && profile.style === 'FTP') {
    warnings.push('FTP mode: no owned coaches available. Consider Academy coach timings.');
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
    availableCoaches,
    targetTier,
    profile.greens,
    profile.isPremiumSponsor
  );

  warnings.push(...projectionWarnings);

  const totalOvrGain = Number((finalOvr - player.overall).toFixed(1));

  const coachSummary = availableCoaches.length > 0
    ? availableCoaches.map(c => `${c.type} ×${c.multiplier}`).join(', ')
    : 'none';

  const tierSummary = targetTier ? ` → ${targetTier} tier` : '';
  const greenSummary = profile.greens > 0 ? ` + ${profile.greens} greens` : '';

  const recommendation =
    `Apply coaches first (${coachSummary})${tierSummary}${greenSummary}. ` +
    `Projected OVR: ${player.overall} → ${finalOvr} (+${totalOvrGain}).`;

  const resourceLines = [
    availableCoaches.length > 0 ? `${availableCoaches.length} coach(es)` : null,
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
