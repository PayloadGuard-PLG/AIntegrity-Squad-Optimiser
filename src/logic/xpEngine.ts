import { GameProfile, TalentTier, TierName } from '../types/resources';

/**
 * Returns the XP cost per 1% stat gain at a given stat value.
 * Returns Infinity when statValue >= profile.rule180StatCap (180-rule).
 */
export function xpBaseForStat(statValue: number, profile: GameProfile): number {
  if (statValue >= profile.rule180StatCap) return Infinity;
  for (const entry of profile.xpCostTable) {
    if (statValue >= entry.statMin && statValue <= entry.statMax) {
      return entry.xpPer1Pct === -1 ? Infinity : entry.xpPer1Pct;
    }
  }
  return Infinity;
}

/**
 * XP required to gain 1% on a single stat.
 * Incorporates age, talent, white/grey, 2× ad, drill level, and star decay.
 *
 * @param starsGainedInSession - cumulative stars earned in the current session so far
 */
export function xpNeededFor1Pct(
  statValue: number,
  age: number,
  starsGainedInSession: number,
  talent: TalentTier,
  isWhite: boolean,
  twoxAd: boolean,
  drillLevelMult: number,
  profile: GameProfile
): number {
  const base = xpBaseForStat(statValue, profile);
  if (!isFinite(base)) return Infinity;

  const ageMult    = getAgeMultiplier(age, profile);
  const starMult   = Math.pow(profile.starDecayPerSession, starsGainedInSession);
  const talentMult = profile.talentMultipliers[talent] ?? 1.0;
  const greyMult   = isWhite ? 1.0 : profile.greyWeightMultiplier;
  const adMult     = twoxAd ? profile.twoxAdMultiplier : 1.0;

  const divisor = ageMult * starMult * talentMult * greyMult * adMult * drillLevelMult;
  if (divisor === 0) return Infinity;
  return base / divisor;
}

/**
 * Estimates the fractional stat gain for a given XP budget.
 *
 * Stats have sub-integer internal values. XP accumulates fractionally across
 * sessions — a visible "+1" only appears when the cumulative value crosses an
 * integer threshold. This function returns a float (e.g. 2.37), not a floor.
 * The fractional part represents banked progress toward the next integer.
 */
export function estimateStatGainPct(
  xpBudget: number,
  statValue: number,
  age: number,
  starsGainedInSession: number,
  talent: TalentTier,
  isWhite: boolean,
  twoxAd: boolean,
  drillLevelMult: number,
  profile: GameProfile
): number {
  let remaining = xpBudget;
  let gain = 0;
  let current = statValue;

  while (remaining > 0 && current < profile.statCap) {
    const cost = xpNeededFor1Pct(current, age, starsGainedInSession + gain, talent, isWhite, twoxAd, drillLevelMult, profile);
    if (!isFinite(cost) || cost <= 0) break;
    if (cost > remaining) {
      gain += remaining / cost; // fractional: bank the partial progress
      break;
    }
    remaining -= cost;
    gain += 1;
    current += 1;
  }
  return gain;
}

/**
 * Quality% = unweighted mean of all attributes.
 * Attributes whose keys are present in the stats map are included.
 * If the map has fewer than profile.totalAttributeCount keys, missing stats default to 0.
 */
export function statsToQualityPct(
  stats: Record<string, number>,
  profile: GameProfile
): number {
  const values = Object.values(stats);
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / profile.totalAttributeCount;
}

/** OVR = Quality% / qualityOvrDivisor */
export function qualityPctToOvr(qualityPct: number, profile: GameProfile): number {
  return Number((qualityPct / profile.qualityOvrDivisor).toFixed(1));
}

/**
 * Applies a tier upgrade by adding the INCREMENTAL bonus to every white stat.
 * The incremental is: tierAttrAdditions[targetTier] - tierAttrAdditions[fromTier].
 * Pass fromTier = player's current tier so only the net gain is applied.
 * Returns a new stats object (does not mutate input).
 * White stats are capped at profile.statCap after addition.
 */
export function applyTierBonusToStats(
  stats: Record<string, number>,
  whiteStatKeys: string[],
  targetTier: TierName,
  profile: GameProfile,
  fromTier: TierName = 'None'
): Record<string, number> {
  const totalAddition = profile.tierAttrAdditions[targetTier] ?? 0;
  const prevAddition  = profile.tierAttrAdditions[fromTier]   ?? 0;
  const increment = totalAddition - prevAddition;
  if (increment <= 0) return { ...stats };

  const updated = { ...stats };
  for (const key of whiteStatKeys) {
    if (key in updated) {
      updated[key] = Math.min(updated[key] + increment, profile.statCap);
    }
  }
  return updated;
}

/**
 * Returns the age multiplier for a given age.
 * Interpolates linearly between the two nearest entries in profile.ageTable.
 * Clamps below the minimum table value for ages above the highest entry.
 */
export function getAgeMultiplier(age: number, profile: GameProfile): number {
  const table = profile.ageTable;
  const ages = Object.keys(table).map(Number).sort((a, b) => a - b);

  if (age <= ages[0]) return table[ages[0].toString()];

  for (let i = 0; i < ages.length - 1; i++) {
    const a0 = ages[i];
    const a1 = ages[i + 1];
    if (age >= a0 && age <= a1) {
      const t = (age - a0) / (a1 - a0);
      const v0 = table[a0.toString()];
      const v1 = table[a1.toString()];
      return Number((v0 + t * (v1 - v0)).toFixed(4));
    }
  }

  // Beyond highest table entry — clamp to minimum
  return table[ages[ages.length - 1].toString()];
}
