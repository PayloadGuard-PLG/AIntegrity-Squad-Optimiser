/**
 * engineMath.ts — Pure, isolated math functions for every projection stage.
 *
 * Rules:
 *   - No React Native imports. No database. No full GameProfile objects.
 *   - Each function takes primitives, returns a value.
 *   - Each stage can be tuned, tested, or replaced independently.
 *   - Compounding effects are explicit in combinedMultiplier().
 *
 * Pipeline order (enforced by game mechanics):
 *   Drills → Coaching → Tier Upgrade → Restorers (condition only)
 *
 * Stage map:
 *   1. xpCostAtStat       — cost curve: how expensive each stat point is
 *   2. ageMultiplier       — age efficiency factor
 *   3. talentMultiplier    — talent efficiency factor
 *   4. greyMultiplier      — white vs grey stat weight
 *   5. starDecayMultiplier — in-session decay as OVR accumulates
 *   6. combinedMultiplier  — compounded efficiency (all factors in one place)
 *   7. coachBudgetPerStat  — XP available per stat for a coaching session
 *   8. drillBudgetPerStat  — XP available per stat for a drill session
 *   9. statGainFromBudget  — integral: how many stat points the budget buys
 *  10. ovrFromStats        — OVR formula: floor(sum / 15)
 *  11. tierOvrContrib      — tier's OVR contribution
 *  12. baseOvrFromTotal    — base OVR (total minus tier contrib)
 *  13. isTrainingLocked    — training lock check (base OVR ≥ 180)
 *  14. conditionDrainPct   — condition lost per drill
 *  15. isZeroDrain         — zero-drain detection
 *  16. conditionRestoredPct — condition from restorers
 */

import {
  C0, K,
  BASE_XPS, DRILL_XP_FACTOR, SESSION_BUDGET_DECAY,
  GREY_MULT,
  AGE_TABLE,
  TALENT_MULTS,
  STAR_DECAY, STAR_OVR_THRESHOLD,
  TWOX_AD_MULT,
  TOTAL_ATTRS, OVR_DIVISOR,
  TIER_ADDITIONS,
  MAX_BASE_OVR,
  COND_LEVEL_MULTS, FAN_COND_REDUCTION, BASE_LOSS_PER_DRILL, ZERO_DRAIN_THRESHOLD,
  CONDITION_PER_RESTORER,
  STAT_CAP,
} from './engineConstants';

// ─── STAGE 1: XP COST CURVE ──────────────────────────────────────────────────
// cost(stat) = C₀ × exp(stat / K)
// Tune: adjust C0 and/or K in game_2025.json. Only affects the cost curve — all
// other stages (age, talent, grey, budget) are unaffected.
export function xpCostAtStat(stat: number): number {
  return C0 * Math.exp(stat / K);
}

// ─── STAGE 2a: AGE MULTIPLIER ────────────────────────────────────────────────
// Lookup with linear interpolation between bracketed entries.
// Tune: update ageTable entries in game_2025.json. Does not affect other multipliers.
export function ageMultiplier(age: number): number {
  const ages = Object.keys(AGE_TABLE).map(Number).sort((a, b) => a - b);
  if (age <= ages[0]) return AGE_TABLE[ages[0].toString()];
  for (let i = 0; i < ages.length - 1; i++) {
    const a0 = ages[i];
    const a1 = ages[i + 1];
    if (age >= a0 && age <= a1) {
      const t  = (age - a0) / (a1 - a0);
      const v0 = AGE_TABLE[a0.toString()];
      const v1 = AGE_TABLE[a1.toString()];
      return Number((v0 + t * (v1 - v0)).toFixed(4));
    }
  }
  return AGE_TABLE[ages[ages.length - 1].toString()];
}

// ─── STAGE 2b: TALENT MULTIPLIER ─────────────────────────────────────────────
// Tune: update talentMultipliers in game_2025.json. Isolated from cost curve and age.
export function talentMultiplier(talent: string): number {
  return TALENT_MULTS[talent] ?? 1.0;
}

// ─── STAGE 2c: GREY STAT WEIGHT ──────────────────────────────────────────────
// White stats: 1.0. Grey (secondary) stats: GREY_MULT (0.22 → ~4.5× more expensive).
// Tune: update greyWeightMultiplier in game_2025.json. Only affects grey stat costs.
export function greyMultiplier(isWhite: boolean): number {
  return isWhite ? 1.0 : GREY_MULT;
}

// ─── STAGE 2d: STAR DECAY ────────────────────────────────────────────────────
// Efficiency decays as the player earns stars within a single session.
// starsGained = floor(sessionOvrGainSoFar / STAR_OVR_THRESHOLD)
// Tune: update starDecayPerSession or starOvrThreshold in game_2025.json.
export function starsGainedFromOvrGain(sessionOvrGain: number): number {
  return Math.floor(sessionOvrGain / STAR_OVR_THRESHOLD);
}

export function starDecayMultiplier(starsGained: number): number {
  return Math.pow(STAR_DECAY, starsGained);
}

// ─── STAGE 3: COMBINED MULTIPLIER ────────────────────────────────────────────
// This is the full compounding efficiency chain applied as a divisor on XP cost.
// Higher combinedMultiplier = cheaper training = more stat gain per XP.
//
// Formula: ageMult × talentMult × greyMult × starDecay × adMult × drillLevelMult
//
// Each factor is independent — tuning one does not change any other.
// This is the single place where compounding effects are composed.
export function combinedMultiplier(params: {
  age: number;
  talent: string;
  isWhite: boolean;
  starsGained: number;
  twoxAd: boolean;
  drillLevelMult: number;
}): number {
  const { age, talent, isWhite, starsGained, twoxAd, drillLevelMult } = params;
  const am = ageMultiplier(age);
  const tm = talentMultiplier(talent);
  const gm = greyMultiplier(isWhite);
  const sm = starDecayMultiplier(starsGained);
  const ad = twoxAd ? TWOX_AD_MULT : 1.0;
  return am * tm * gm * sm * ad * drillLevelMult;
}

// ─── STAGE 4a: COACHING BUDGET ───────────────────────────────────────────────
// XP available per stat for a coaching session.
// budget = sessions × BASE_XPS / numStats
// Standard/Extensive: numStats = 5 (full category). Focused: numStats = 1 or 2.
// Reward Coach: numStats = actual boosted stats detected by OCR.
// Tune: update baseXpPerSession or sessionBudgetDecay in game_2025.json.
// Each successive session delivers SESSION_BUDGET_DECAY × the previous session's XP.
// effectiveSessions = (1 - decay^N) / (1 - decay) — plateaus at 1/(1-decay) for large N.
// With decay=0.99: ×4 ≈ 3.94, ×40 ≈ 33.1, ×114 ≈ 68.2 (vs linear 4, 40, 114).
export function coachBudgetPerStat(sessions: number, numStats: number): number {
  if (numStats <= 0) return 0;
  const decay = SESSION_BUDGET_DECAY;
  const effectiveSessions = (decay >= 1.0 || sessions <= 0)
    ? sessions
    : (1 - Math.pow(decay, sessions)) / (1 - decay);
  return (effectiveSessions * BASE_XPS) / numStats;
}

// ─── STAGE 4b: DRILL BUDGET ──────────────────────────────────────────────────
// XP available per stat for a drill session.
// budget = cycles × BASE_XPS × DRILL_XP_FACTOR / numStatsDrilled
// ⚠️ DRILL_XP_FACTOR = 0.3 is uncalibrated. Tune when controlled drill data is available.
export function drillBudgetPerStat(cycles: number, numStatsDrilled: number): number {
  if (numStatsDrilled <= 0) return 0;
  return (cycles * BASE_XPS * DRILL_XP_FACTOR) / numStatsDrilled;
}

// ─── STAGE 5: STAT GAIN FROM BUDGET ─────────────────────────────────────────
// Core training integral. Iterates 1 stat point at a time from startStat.
// Each point costs: xpCostAtStat(current) / combinedMultiplier
// Fractional remainder banks as sub-integer progress (internal game state).
//
// Tune cost curve (stages 1) or multiplier (stage 3) independently without changing this.
export function statGainFromBudget(
  startStat: number,
  budget: number,
  mult: number,
): number {
  if (mult <= 0 || budget <= 0) return 0;
  let remaining = budget;
  let gain      = 0;
  let current   = startStat;

  while (remaining > 0 && current < STAT_CAP) {
    const cost = xpCostAtStat(current) / mult;
    if (!isFinite(cost) || cost <= 0) break;
    if (cost > remaining) {
      gain += remaining / cost;  // fractional: bank partial progress
      break;
    }
    remaining -= cost;
    gain      += 1;
    current   += 1;
  }
  return gain;
}

// ─── STAGE 6: OVR FORMULA ────────────────────────────────────────────────────
// OVR = floor(sum(all 15 stats) / 15)
// Confirmed ✅ from Grant T2→T3 clean tier upgrade. floor wins over ceil/round.
export function ovrFromStats(stats: Record<string, number>): number {
  if (Object.keys(stats).length === 0) return 0;
  const sum = Object.values(stats).reduce((a, b) => a + b, 0);
  return Math.floor(sum / (TOTAL_ATTRS * OVR_DIVISOR));
}

// OVR from stats map with padding for missing stats (uses known overall as baseline).
// Needed when only some stats are entered — avoids treating missing stats as 0.
export function ovrFromStatsWithPadding(
  stats: Record<string, number>,
  knownOverall: number,
): number {
  const keys = Object.keys(stats);
  if (keys.length === 0) return knownOverall;
  const entered      = Object.values(stats).reduce((a, b) => a + b, 0);
  const missingCount = Math.max(0, TOTAL_ATTRS - keys.length);
  const sum          = entered + knownOverall * missingCount;
  return Math.floor(sum / (TOTAL_ATTRS * OVR_DIVISOR));
}

// ─── STAGE 7: TIER CONTRIBUTION ──────────────────────────────────────────────
// Tier OVR contribution = floor(tierBonus × whiteStatCount / 15)
// Example: Stellar (T3, +50) × 12 white stats = 600 / 15 = 40 OVR.
export function tierOvrContrib(tier: string, whiteStatCount: number): number {
  const bonus = TIER_ADDITIONS[tier] ?? 0;
  return Math.floor((bonus * whiteStatCount) / TOTAL_ATTRS);
}

// ─── STAGE 8: TRAINING LOCK ──────────────────────────────────────────────────
// Base OVR = total OVR − tier OVR contribution.
// Training locks when base OVR ≥ MAX_BASE_OVR (180).
// The 180 cap applies to base OVR only — tier bonuses push total OVR beyond 180 normally.
export function baseOvrFromTotal(
  totalOvr: number,
  tier: string,
  whiteStatCount: number,
): number {
  return totalOvr - tierOvrContrib(tier, whiteStatCount);
}

export function isTrainingLocked(baseOvr: number): boolean {
  return baseOvr >= MAX_BASE_OVR;
}

// ─── STAGE 9: CONDITION DRAIN ────────────────────────────────────────────────
// conditionLoss = baseLoss × intensityMult × (1 − fanClubReduction / 100)
// Zero-drain fires when loss < ZERO_DRAIN_THRESHOLD (0.375%).
// Only Very Easy + Fan Club L4 qualifies (0.375%).
export function conditionDrainPct(drillIntensity: string, fanLevel: number): number {
  const intMult = COND_LEVEL_MULTS[drillIntensity] ?? 1;
  const fanRed  = FAN_COND_REDUCTION[fanLevel] ?? 0;
  return BASE_LOSS_PER_DRILL * intMult * (1 - fanRed / 100);
}

export function isZeroDrain(drainPct: number): boolean {
  return drainPct < ZERO_DRAIN_THRESHOLD;
}

// ─── STAGE 10: CONDITION RESTORATION ─────────────────────────────────────────
// 15% condition per restorer, capped at 100%.
export function conditionRestoredPct(restorers: number): number {
  return Math.min(restorers * CONDITION_PER_RESTORER, 100);
}

// ─── SEASON DECAY ────────────────────────────────────────────────────────────
// Flat 20 pts per level promoted. White and grey drop equally. Not proportional.
export function applySeasonDecay(
  stats: Record<string, number>,
  levelsPromoted: number,
  decayPerLevel: number,
): Record<string, number> {
  const drop   = decayPerLevel * levelsPromoted;
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(stats)) {
    result[key] = Math.max(0, value - drop);
  }
  return result;
}

// ─── TALENT BACK-CALCULATION ─────────────────────────────────────────────────
// Given observed gain from a coach scan, find which talent tier best explains it.
// Uses only the white-stat path for cleaner signal (grey multiplier adds noise).
// bestTier = tier whose forward prediction is closest to gainMid.
// confidence = 'high' if best score < 20% of gainMid, else 'low'.
export function estimateTalentFromGain(params: {
  statBefore: number;
  gainMid: number;
  sessions: number;
  numStats: number;
  age: number;
  isWhite: boolean;
  twoxAd: boolean;
  drillLevelMult: number;
}): { bestTier: string; confidence: 'high' | 'low'; candidateScores: Record<string, number> } {
  const { statBefore, gainMid, sessions, numStats, age, isWhite, twoxAd, drillLevelMult } = params;
  const budget = coachBudgetPerStat(sessions, numStats);
  const tiers = ['Fastest', 'Fast', 'Average', 'Normal', 'Slow'];
  const candidateScores: Record<string, number> = {};

  let bestTier = 'Normal';
  let bestScore = Infinity;

  for (const tier of tiers) {
    const mult = combinedMultiplier({ age, talent: tier, isWhite, starsGained: 0, twoxAd, drillLevelMult });
    const predicted = statGainFromBudget(statBefore, budget, mult);
    const score = Math.abs(predicted - gainMid);
    candidateScores[tier] = Number(predicted.toFixed(2));
    if (score < bestScore) { bestScore = score; bestTier = tier; }
  }

  const confidence: 'high' | 'low' = gainMid > 0 && bestScore < gainMid * 0.2 ? 'high' : 'low';
  return { bestTier, confidence, candidateScores };
}

// ─── FULL COACHING PROJECTION ─────────────────────────────────────────────────
// Composed pipeline for a single coaching session.
// Input: session params + current stat values for the coached stats.
// Output: projected gain (fractional) per stat name.
// Caller is responsible for applying gains to the player record and recomputing OVR.
export function projectCoachGains(params: {
  sessions: number;
  statValues: Record<string, number>;  // statName → current value for coached stats only
  whiteStats: Set<string>;
  age: number;
  talent: string;
  sessionOvrGainSoFar: number;
  twoxAd: boolean;
  drillLevelMult: number;  // 1.0 for all academy coaches (no intensity)
}): Record<string, number> {
  const { sessions, statValues, whiteStats, age, talent, sessionOvrGainSoFar, twoxAd, drillLevelMult } = params;
  const numStats = Object.keys(statValues).length;
  if (numStats === 0) return {};

  const budget    = coachBudgetPerStat(sessions, numStats);
  const stars     = starsGainedFromOvrGain(sessionOvrGainSoFar);
  const result: Record<string, number> = {};

  for (const [statName, startStat] of Object.entries(statValues)) {
    const isWhite = whiteStats.has(statName);
    const mult    = combinedMultiplier({ age, talent, isWhite, starsGained: stars, twoxAd, drillLevelMult });
    result[statName] = statGainFromBudget(startStat, budget, mult);
  }
  return result;
}
