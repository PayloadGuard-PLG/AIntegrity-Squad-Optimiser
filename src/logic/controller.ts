import { isEssentialGain, validateRoleAdjacency } from '../utils/roleWeights';
import { DRILL_LIST } from '../database/drillDatabase';
import { calculateActualLoss } from '../utils/conditionEngine';
import { Player } from '../database/playerSchema';

export const getRecommendedDrills = (player: Player, fanClubLevel: number = 4, drillLevel: string = 'Very Easy') =>
    getDrillRecommendations(player, fanClubLevel, drillLevel);

export const getDrillRecommendations = (player: Player, fanClubLevel: number = 4, drillLevel: string = 'Very Easy') =>
    getBestDrillSelections(player, fanClubLevel, drillLevel);

export function getBestDrillSelections(player: Player, fanClubLevel: number = 4, drillLevel: string = 'Very Easy') {
    if (!validateRoleAdjacency(player.role)) {
        throw new Error(`Invalid combination: Roles must be adjacent.`);
    }

    const whiteStats = Object.keys(player.stats).filter(stat => isEssentialGain(player.role, stat));

    return DRILL_LIST.map(drill => {
        const actualLoss = calculateActualLoss(drill.baseLoss, fanClubLevel);
        // Zero drain is per-drill: Ball Control Very Easy L4 = -0.38% (not zero).
        // Only drills whose computed loss rounds to 0.00% in the game UI qualify.
        const isZeroDrain = actualLoss < 0.01;
        const whiteDrillStats = drill.stats.filter(s => whiteStats.includes(s));
        const efficiency = whiteDrillStats.length / drill.stats.length;
        const conditionCost = isZeroDrain ? 0 : actualLoss * 6;

        // Average current value of white stats this drill trains.
        // Lower average = cheaper XP cost per 1% = higher gain per session.
        const vals = whiteDrillStats.map(s => player.stats[s]).filter((v): v is number => v !== undefined);
        const avgWhiteStatValue = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : Infinity;

        return {
            name: drill.name,
            type: drill.type,
            efficiency,
            conditionCost,
            isZeroDrain,
            avgWhiteStatValue,
            whiteHits: drill.stats.map(stat => ({ stat, white: whiteStats.includes(stat) })),
        };
    })
    .filter(d => d.efficiency >= 0.5)
    .sort((a, b) => {
        // Primary: lowest average white stat value (cheapest gains first)
        if (a.avgWhiteStatValue !== b.avgWhiteStatValue) return a.avgWhiteStatValue - b.avgWhiteStatValue;
        // Tiebreaker: highest white stat coverage
        return b.efficiency - a.efficiency;
    });
}
