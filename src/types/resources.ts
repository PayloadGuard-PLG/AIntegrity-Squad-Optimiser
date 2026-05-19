// --- Game profile (loaded from profiles/game_2025.json) ---

export interface XpCostEntry {
  statMin: number;
  statMax: number;
  xpPer1Pct: number; // -1 means Infinity (180-rule)
}

export interface GameProfile {
  version: string;
  xpCostTable: XpCostEntry[];
  /** If set, xpBaseForStat uses exponential formula instead of the stepped table:
   *  cost(stat) = xpCostBase * exp(stat / xpCostDecayK)
   *  Derived from Grant ×40 calibration: K=47, base=2.94 (C0 fixed, bXPS absorbs scaling)
   */
  xpCostBase?: number;
  xpCostDecayK?: number;
  /**
   * Flat stat points lost per stat per manager level promoted at season end.
   * Confirmed 20 from Grant T3 before/after season screenshots — same for white and grey stats.
   * Relegation (negative levelsPromoted) adds this value instead of subtracting.
   */
  seasonDecayPerLevel?: number;
  ageTable: Record<string, number>;
  talentMultipliers: Record<string, number>;
  /** XP gain multipliers per drill difficulty (stat training) */
  drillLevelMultipliers: Record<string, number>;
  /** Cumulative attribute addition per tier (from T0 baseline) */
  tierAttrAdditions: Record<string, number>;
  /** Per-step tier increment (e.g. T1→T2 = +20 per white stat) */
  tierIncrements: Record<string, number>;
  tierPointsRequired: Record<string, number>;
  /** Fraction of condition loss removed per fan club level (index = level) */
  fanClubCondReduction: number[];
  /** Condition drain multiplier per drill difficulty (separate from XP multipliers) */
  condLevelMultipliers: Record<string, number>;
  /** Base condition % lost per drill before level/fan modifiers */
  baseLossPerDrill: number;
  /** conditionLoss values below this threshold display as 0% in-game */
  zeroDrainThreshold: number;
  /** Grey (secondary) stats train at this fraction of white XP efficiency */
  greyWeightMultiplier: number;
  statCap: number;
  /** Training locks when base OVR (floor of stat mean) reaches this value */
  maxBaseOvr: number;
  /** XP units awarded per coaching/drill session before multipliers */
  baseXpPerSession: number;
  /** Scaling factor for drill budget vs coach budget — UNCALIBRATED, needs real drill data */
  drillXpFactor?: number;
  twoxAdMultiplier: number;
  starDecayPerSession: number;
  /** OVR gain per star threshold — decay applies each time cumulative session OVR gain crosses a multiple of this */
  starOvrThreshold: number;
  /** OVR = floor(sum / totalAttributeCount) */
  qualityOvrDivisor: number;
  totalAttributeCount: number;
  teamPlayDecayPerDay: number;
  matchAdvisorMultiplier: number;
  teamPlayFreeDrillsPerDay: number;
  /** Condition % restored per restorer item */
  conditionPerRestorer: number;
  maxTrainingLevel: number;
}

// --- Talent & drill levels ---

export type TalentTier = 'Fastest' | 'Fast' | 'Average' | 'Normal' | 'Slow';
export type DrillLevel = 'Very Easy' | 'Easy' | 'Medium' | 'Hard' | 'Very Hard';

// --- Drill session (replaces coach card as the training unit) ---

export interface DrillSession {
  drillName: string;
  sessionCount: number;
  drillLevel: DrillLevel;
}

// --- Legacy coach types (kept for DB backward compatibility) ---

export type CoachType = 'Attacking' | 'Defending' | 'Physical' | 'Mixed' | 'Focused'; // legacy
export type SessionType = 'Training' | 'Seminar'; // legacy

export interface CoachCost {
  currency: 'tokens' | 'cash' | 'free';
  amount: number;
}

export interface Coach { // legacy — DB schema keeps this table
  id: string;
  type: CoachType;
  sessionType: SessionType;
  multiplier: number;
  attributes: string[];
  durationDays: number;
  source: 'Academy' | 'PremiumChest' | 'Store' | 'Other';
  cost: CoachCost;
}

// --- Manager profile ---

export type ManagerStyle = 'FTP' | 'Hybrid' | 'PTW';

export interface ManagerProfile {
  style: ManagerStyle;
  tierPoints: Partial<Record<TierName, number>>;
  restorers: number;
  isPremiumSponsor: boolean;
  storeBudget?: number;
  twoxAdActive: boolean;
  talentTier: TalentTier;
  drillLevel: DrillLevel;
  matchAdvisorActive: boolean;
  teamPlayPillars?: Partial<Record<TeamPlayPillar, number>>;
}

// --- Tier system ---

export type TierName = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';

export type FanLevel = 0 | 1 | 2 | 3 | 4;

// --- Team Play ---

export type TeamPlayPillar = 'attack' | 'defence' | 'possession' | 'condition';

export interface TeamPlayPlan {
  pillars: Partial<Record<TeamPlayPillar, number>>;
  decayPerDay: number;
  freeDrillsNeeded: number;
  matchAdvisorCoversDecay: boolean;
  recommendation: string;
}

export interface FixtureWindow {
  cycles: number;
  totalSessions: number;
}

export interface GreensBridgeSuggestion {
  restorersNeeded: number;
  additionalCycles: number;
  worthwhile: boolean;
  note: string;
}

// --- Investment plan ---

export type InvestmentStepAction = 'drill' | 'tier' | 'condition';

export interface InvestmentStep {
  action: InvestmentStepAction;
  description: string;
  ovrBefore: number;
  ovrAfter: number;
  resourcesUsed: string;
}

export interface InvestmentPlan {
  player: { name: string; currentOvr: number };
  steps: InvestmentStep[];
  finalOvr: number;
  totalOvrGain: number;
  totalResourceCost: string;
  recommendation: string;
  warnings: string[];
}

// --- Multi-player scenario comparison ---

export interface ScenarioResult {
  playerName: string;
  currentOvr: number;
  projectedOvr: number;
  ovrGain: number;
  plan: InvestmentPlan;
  rank: number;
}

export interface ScenarioComparison {
  results: ScenarioResult[];
  recommendedPlayer: string;
  reasoning: string;
}
