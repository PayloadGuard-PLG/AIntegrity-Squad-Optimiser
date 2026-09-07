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
  /**
   * Fraction of condition drain removed by the Perfect Conditions SURGE, indexed
   * by surge level 0-4. Values are FRACTIONS of 1 (0.1 = -10%), as stated by the
   * in-game surge panel. This only applies when the surge is ACTIVE — see
   * SurgeState. Named `fanClubCondReduction` for backward compatibility; the
   * mechanic is a surge, not a fan club level.
   */
  fanClubCondReduction: number[];
  /** Condition drain multiplier per drill difficulty (separate from XP multipliers) */
  condLevelMultipliers: Record<string, number>;
  /** Base condition % lost per drill before level/fan modifiers */
  baseLossPerDrill: number;
  /**
   * @deprecated Obsolete. The game patched the 0% drain loophole; sub-threshold
   * drills are now charged the minimum below, not zeroed. Retained only so
   * existing profiles parse. Use `minimumConditionDrainPct`.
   */
  zeroDrainThreshold: number;
  /**
   * Minimum condition % charged for any training session. Raw drain below this
   * is charged UP to it — confirmed empirically: single Very Easy drills at
   * surge-inactive (raw 0.750%) are charged -1.00% in game.
   */
  minimumConditionDrainPct: number;
  /**
   * Odds the campus ball assigns a chant to each surge. Typed loosely here so the
   * raw profile JSON still satisfies GameProfile; narrow to ChantOdds at use.
   */
  chantOdds?: { kind: string; [k: string]: unknown };
  /** The six fan-club surges and their level tables, as stated in game. */
  surges?: Record<string, {
    label: string; description: string; effect: string;
    unit: string; levels: number[]; scope: string; modelled: boolean;
  }>;
  /** Loyalty needed to activate each surge. */
  surgeLoyaltyThresholds?: { kind: string; [k: string]: unknown };
  /** Grey (secondary) stats train at this fraction of white XP efficiency */
  greyWeightMultiplier: number;
  statCap: number;
  /** Training locks when base OVR (floor of stat mean) reaches this value */
  maxBaseOvr: number;
  /** XP units awarded per coaching/drill session before multipliers */
  baseXpPerSession: number;
  /** Scaling factor for drill budget vs coach budget — UNCALIBRATED, needs real drill data */
  drillXpFactor?: number;
  /**
   * Per-session budget decay — each successive session of the same coach gives slightly less XP.
   * Effective sessions = (1 - decay^N) / (1 - decay) instead of N.
   * Confirmed ✅ 0.99 from LJDark Leo ×114 GK: linear gives 182 OVR (wrong), geometric gives 172 OVR (actual: 173 ✓).
   * Explains the long-running ×N anomaly: at large N the geometric sum plateaus (~100 effective sessions max).
   */
  sessionBudgetDecay?: number;
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

export type TalentTier = 'Fastest' | 'Fast' | 'Average' | 'Normal' | 'Slow' | 'Unknown';
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

// --- Fan Club surges ---

/**
 * THE SURGE BOARD — six benefits on the fan-loyalty bar, all observed in game.
 *
 * Two independent axes per surge:
 *   active — gated on fan loyalty crossing the surge's threshold. Loyalty resets
 *            to 0 every season, so every season STARTS with everything inactive.
 *   level  — 0-4, raised by chants. A chant upgrades ONE surge chosen at random,
 *            so levels can be banked while a surge is still inactive and cannot
 *            be aimed at a chosen surge.
 *
 * Modelling any of this as a single "fan club level" is wrong for every user at
 * season start, because it assumes the benefit always applies.
 */
export type SurgeId =
  | 'perfectConditions'
  | 'roleAccelerator'
  | 'teamplayPower'
  | 'respectableAttendance'
  | 'packedAttendance'
  | 'buzzingAttendance';

export const SURGE_IDS: SurgeId[] = [
  'perfectConditions', 'roleAccelerator', 'teamplayPower',
  'respectableAttendance', 'packedAttendance', 'buzzingAttendance',
];

export const SURGE_COUNT = SURGE_IDS.length; // 6

/** Perfect Conditions surge level. Raised by chants, which pick a surge at random. */
export type SurgeLevel = 0 | 1 | 2 | 3 | 4;

/** What a surge does, and in what units its level table is expressed. */
export interface SurgeDefinition {
  label: string;
  description: string;
  effect: string;
  /** 'fraction' → 0.5 means -50%. 'percent' → 50 means +50%. */
  unit: 'fraction' | 'percent';
  /** Value at each level 0-4, exactly as the in-game surge panel states it. */
  levels: number[];
  scope: string;
  /** Whether the engine currently consumes this surge. */
  modelled: boolean;
}

export interface SurgeStatus {
  active: boolean;
  level: SurgeLevel;
}

/** Observed state of the whole board. */
export type SurgeBoard = Record<SurgeId, SurgeStatus>;

/** Season start: loyalty 0, every surge off, every level 0. */
export const SURGE_BOARD_SEASON_START: SurgeBoard = {
  perfectConditions:     { active: false, level: 0 },
  roleAccelerator:       { active: false, level: 0 },
  teamplayPower:         { active: false, level: 0 },
  respectableAttendance: { active: false, level: 0 },
  packedAttendance:      { active: false, level: 0 },
  buzzingAttendance:     { active: false, level: 0 },
};

/**
 * The condition-relevant slice of the board. Kept as its own type so the
 * condition engine takes only what it needs.
 */
export interface SurgeState {
  perfectConditionsActive: boolean;
  perfectConditionsLevel: SurgeLevel;
}

export const SURGE_STATE_SEASON_START: SurgeState = {
  perfectConditionsActive: false,
  perfectConditionsLevel: 0,
};

/** Narrow a full board to the condition slice the drain model consumes. */
export function conditionSurgeOf(board: SurgeBoard): SurgeState {
  return {
    perfectConditionsActive: board.perfectConditions.active,
    perfectConditionsLevel: board.perfectConditions.level,
  };
}

/**
 * Campus-ball chant odds.
 *
 * Three states, deliberately: "not yet observed" must stay structurally distinct
 * from "observed to be uniform" so nothing silently defaults into an assumption.
 * Consumers MUST abstain on `unobserved` rather than fall back to 1/6 — the same
 * observed-absence-vs-failed-observation rule the scanner readers follow.
 *
 * NOT YET WIRED: no runtime code consumes this. Any projection built on it must
 * return a bounded range, never a point estimate (see src/types/future.ts).
 */
export type ChantOdds =
  | { kind: 'unobserved' }
  | { kind: 'published'; perSurge: Partial<Record<SurgeId, number>>; source: string }
  | { kind: 'estimated'; perSurge: Partial<Record<SurgeId, number>>; n: number };

/** Loyalty required to activate each surge. Not yet read off the loyalty bar. */
export type SurgeThresholds =
  | { kind: 'unobserved' }
  | { kind: 'observed'; loyalty: Partial<Record<SurgeId, number>> };

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
