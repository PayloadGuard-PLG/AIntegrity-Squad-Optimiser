export const FAN_CLUB_REDUCTIONS: Record<number, number> = {
    0: 10, 1: 15, 2: 20, 3: 25, 4: 50
};

// Condition drain multiplier per difficulty level.
// Separate from XP drillLevelMultipliers in profile.
export const COND_LEVEL_MULTIPLIERS: Record<string, number> = {
    'Very Easy': 1,
    'Easy':      2,
    'Medium':    3,
    'Hard':      4,
    'Very Hard': 5,
};

// Returns per-drill condition loss %.
// baseLoss = 0.75 (universal for all drills) × difficulty mult × fan club retention.
// Very Easy + L4 fan club → 0.375 → isZeroDrain.
export function calculateActualLoss(baseLoss: number, fanLevel: number, drillLevel: string = 'Very Easy'): number {
    const reduction = FAN_CLUB_REDUCTIONS[fanLevel] ?? 0;
    const diffMult  = COND_LEVEL_MULTIPLIERS[drillLevel] ?? 1;
    return baseLoss * diffMult * ((100 - reduction) / 100);
}
