// --- Game profile (loaded from profiles/game_2025.json) ---

export interface XpCostEntry {
  statMin: number;
  statMax: number;
  xpPer1Pct: number; // -1 means Infinity (180-rule)
}

export interface GameProfile {
  version: string;
  xpCostTable: XpCostEntry[];
  ageTable: Record<string, number>;
  talentMultipliers: Record<string, number>;
  drillLevelMultipliers: Record<string, number>;
  tierAttrAdditions: Record<string, number>;
  tierPointsRequired: Record<string, number>;
  fanClubCondReduction: number[];
  greyWeightMultiplier: number;
  statCap: number;
  rule180StatCap: number;
  twoxAdMultiplier: number;
  starDecayPerSession: number;
  qualityOvrDivisor: number;
  totalAttributeCount: number;
}

// --- Talent & drill levels ---

export type TalentTier = 'FT1' | 'FT2' | 'FT3' | 'Normal' | 'Slow';
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
  source: 'Academy' | 'EliteChest' | 'Store' | 'Other';
  cost: CoachCost;
}

// --- Manager profile ---

export type ManagerStyle = 'FTP' | 'Hybrid' | 'PTW';

export interface ManagerProfile {
  style: ManagerStyle;
  tierPoints: Partial<Record<TierName, number>>;
  greens: number;
  isPremiumSponsor: boolean;
  storeBudget?: number;
  twoxAdActive: boolean;
  talentTier: TalentTier;
  drillLevel: DrillLevel;
}

// --- Tier system ---

export type TierName =
  | 'None'
  | 'Rare'
  | 'Elite'
  | 'Stellar'
  | 'Master'
  | 'Epic'
  | 'Legendary';

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
