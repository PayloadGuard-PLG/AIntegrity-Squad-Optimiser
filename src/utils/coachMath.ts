/**
 * Alntegrity Advanced Coach Engine
 * Handles dynamic multipliers from Boost Lab and player-specific variables.
 */
export function calculateDynamicGain(
  multiplier: number,      // From 2 to Max (e.g., 40x)
  age: number,             // 18-21 (Fast), 22-25 (Mid), 26+ (Slow)
  isWhiteSkill: boolean,   // White skills gain faster than grey
  currentAttribute: number // Accounts for hard-caps (e.g., 180% limit)
): number {
  // 1. Age Factor: Under 22 = 1.0, drops significantly as they age
  const ageFactor = age <= 21 ? 1.0 : age <= 24 ? 0.75 : 0.4;

  // 2. Skill Type: Focus on "White" skills (Attack for ST, etc.)
  const skillModifier = isWhiteSkill ? 1.25 : 0.6;

  // 3. Attribute Cap (Diminishing returns after 140%)
  const capFactor = currentAttribute > 140 ? 0.5 : 1.0;

  // Base gain per session x Multiplier x Variables
  const baseSessionGain = 0.045; 
  const result = baseSessionGain * multiplier * ageFactor * skillModifier * capFactor;

  return Number(result.toFixed(4));
}
