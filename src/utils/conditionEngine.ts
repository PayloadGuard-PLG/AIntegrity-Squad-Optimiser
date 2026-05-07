export const FAN_CLUB_REDUCTIONS: Record<number, number> = {
    0: 10, 1: 15, 2: 20, 3: 25, 4: 50
};

// Returns per-session condition loss with full precision (no intermediate rounding).
// Callers multiply by session count for totals — rounding here inflates totals.
export function calculateActualLoss(baseLoss: number, level: number): number {
    const reduction = FAN_CLUB_REDUCTIONS[level] ?? 0;
    return baseLoss * ((100 - reduction) / 100);
}
