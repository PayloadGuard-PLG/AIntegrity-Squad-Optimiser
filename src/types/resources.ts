// --- Coach types ---

export type CoachType = 'Attacking' | 'Defending' | 'Physical' | 'Mixed' | 'Focused';

// Training = free drill session; Seminar = premium (costs tokens), higher base gain rate
export type SessionType = 'Training' | 'Seminar';

export interface Coach {
  id: string;
  type: CoachType;
  sessionType: SessionType;
  multiplier: number;       // The ×N value on the card (e.g. 30 for "Standard Attacking ×30")
  attributes: string[];     // Exact stats this card trains — varies per card instance
  durationDays: number;     // Card expiry window
  source: 'Academy' | 'EliteChest' | 'Store' | 'Other';
  cost: CoachCost;
}

export interface CoachCost {
  currency: 'tokens' | 'cash' | 'free';
  amount: number;
}

// --- Manager profile ---

export type ManagerStyle = 'FTP' | 'Hybrid' | 'PTW';

export interface ManagerProfile {
  style: ManagerStyle;
  coaches: Coach[];
  tierPoints: number;
  greens: number;
  isPremiumSponsor: boolean;   // Unlocks Elite Chest; green efficiency ×1.3 in mutantEngine
  storeBudget?: number;        // Max tokens/cash willing to spend (0 for FTP, undefined = unlimited PTW)
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

export interface InvestmentStep {
  action: 'coach' | 'tier' | 'greens';
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
