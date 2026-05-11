export const FAN_CLUB_REDUCTIONS: Record<number, number> = {
    0: 10, 1: 15, 2: 20, 3: 25, 4: 50
};

// Condition multiplier per difficulty level — confirmed from in-game drain screenshots.
// Separate from XP drillLevelMultipliers in game_2025.json.
export const COND_LEVEL_MULTIPLIERS: Record<string, number> = {
    'Very Easy': 1,
    'Easy':      2,
    'Medium':    3,
    'Hard':      4,
    'Very Hard': 5,
};

// Returns per-drill condition loss %.
// baseLoss = 0.75 (universal for all drills) × difficulty mult × fan club retention.
// Very Easy + L4 → 0.75 × 1 × 0.5 = 0.375 → isZeroDrain (rounds to 0 in game).
export function calculateActualLoss(baseLoss: number, fanLevel: number, drillLevel: string = 'Very Easy'): number {
    const reduction = FAN_CLUB_REDUCTIONS[fanLevel] ?? 0;
    const diffMult  = COND_LEVEL_MULTIPLIERS[drillLevel] ?? 1;
    return baseLoss * diffMult * ((100 - reduction) / 100);
}
