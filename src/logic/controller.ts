import { isWhiteStat, validateRoleAdjacency } from '../utils/roleWeights';
import { DRILL_LIST } from '../database/drillDatabase';
import { calculateActualLoss } from '../utils/conditionEngine';
import { Player } from '../database/playerSchema';

export function getRecommendedDrills(player: Player, fanClubLevel: number = 4, drillLevel: string = 'Very Easy') {
    if (!validateRoleAdjacency(player.role)) {
        throw new Error(`Invalid combination: Roles must be adjacent.`);
    }

    const whiteStats = new Set(Object.keys(player.stats).filter(stat => isWhiteStat(player.role, stat)));

    return DRILL_LIST.map(drill => {
        const actualLoss = calculateActualLoss(drill.baseLoss, fanClubLevel, drillLevel);
        const isZeroDrain = actualLoss < 0.5;
        const whiteDrillStats = drill.stats.filter(s => whiteStats.has(s.toUpperCase()));
        const efficiency = drill.stats.length > 0 ? whiteDrillStats.length / drill.stats.length : 0;
        const conditionCost = isZeroDrain ? 0 : actualLoss;

        const vals = whiteDrillStats.map(s => player.stats[s]).filter((v): v is number => v !== undefined);
        const avgWhiteStatValue = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : Infinity;

        return {
            name: drill.name,
            type: drill.type,
            intensity: drill.intensity,
            efficiency,
            conditionCost,
            isZeroDrain,
            avgWhiteStatValue,
            statsHit: drill.stats,
            whiteHits: drill.stats.map(stat => ({ stat, white: whiteStats.has(stat.toUpperCase()) })),
        };
    })
    .sort((a, b) => {
        if (a.avgWhiteStatValue !== b.avgWhiteStatValue) return a.avgWhiteStatValue - b.avgWhiteStatValue;
        return b.efficiency - a.efficiency;
    });
}

// Aliases for backward compatibility with existing tests
export const getBestDrillSelections = getRecommendedDrills;
export const getDrillRecommendations = getRecommendedDrills;
