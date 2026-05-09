export const FAN_CLUB_REDUCTIONS: Record<number, number> = {
    0: 10, 1: 15, 2: 20, 3: 25, 4: 50
};

// Difficulty multiplier applied to base condition loss.
// baseLoss values in drillDatabase are calibrated at Very Easy.
// NOTE: confirm exact game multipliers — these are estimated until verified.
const DIFFICULTY_MULTIPLIERS: Record<string, number> = {
  'Very Easy': 1.0,
  'Easy':      1.5,
  'Medium':    2.0,
  'Hard':      2.5,
  'Very Hard': 3.0,
};

export function calculateActualLoss(baseLoss: number, fanLevel: number, drillLevel = 'Very Easy'): number {
    const reduction = FAN_CLUB_REDUCTIONS[fanLevel] ?? 0;
    const diffMult  = DIFFICULTY_MULTIPLIERS[drillLevel] ?? 1.0;
    return baseLoss * diffMult * ((100 - reduction) / 100);
}
