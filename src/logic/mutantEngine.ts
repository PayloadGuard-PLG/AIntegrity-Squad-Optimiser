/**
 * Mutant Projection Engine
 * Calculates player growth based on resource expenditure and tiers.
 */
export function calculateMutantProjection(
  baseOvr: number, 
  coachOvrGain: number, 
  greensToSpend: number, 
  tierBonus: number, 
  isPremiumSponsor: boolean
): number {
  let currentOvr = baseOvr + coachOvrGain;
  const efficiencyFactor = isPremiumSponsor ? 1.3 : 1.0; // [cite: 39]
  const gainFromGreens = (greensToSpend / 15) * efficiencyFactor;
  
  currentOvr += gainFromGreens;
  return Number((currentOvr + tierBonus).toFixed(1));
}
