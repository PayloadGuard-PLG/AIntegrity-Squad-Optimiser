export const FAN_CLUB_REDUCTIONS: Record<number, number> = {
    0: 10, 1: 15, 2: 20, 3: 25, 4: 50 
};

export function calculateActualLoss(baseLoss: number, level: number): number {
    const reduction = FAN_CLUB_REDUCTIONS[level] || 0;
    const factor = (100 - reduction) / 100;
    return parseFloat((baseLoss * factor).toFixed(2));
}
