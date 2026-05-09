export const FAN_CLUB_REDUCTIONS: Record<number, number> = {
    0: 10, 1: 15, 2: 20, 3: 25, 4: 50
};

// Difficulty multiplier applied to base condition loss.
// baseLoss in drillDatabase is calibrated at Very Easy (0.75% raw loss).
// Confirmed from game screenshots: VE=0.75%, E=1.5%, M=2.25%, H=3.0%, VH=3.75%.
const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  'Very Easy': 1.0,
  'Easy':      2.0,
  'Medium':    3.0,
  'Hard':      4.0,
  'Very Hard': 5.0,
};

export function calculateActualLoss(baseLoss: number, fanLevel: number, drillLevel = 'Very Easy'): number {
    const reduction = FAN_CLUB_REDUCTIONS[fanLevel] ?? 0;
    const diffMult  = DIFFICULTY_MULTIPLIERS[drillLevel] ?? 1.0;
    return baseLoss * diffMult * ((100 - reduction) / 100);
}
