import { isWhiteStat, validateRoleAdjacency } from '../utils/roleWeights';
import { DRILL_LIST } from '../database/drillDatabase';
import { calculateActualLoss } from '../utils/conditionEngine';
import { Player } from '../database/playerSchema';

/**
 * AIntegrity Audited Controller
 * Synchronizes UI Filter Strings with Database baseLoss values
 */
export function getRecommendedDrills(player: Player, fanClubLevel: number = 4, uiDrillFilter?: string) {
    if (!validateRoleAdjacency(player.role)) {
        throw new Error(`Invalid combination: Roles must be adjacent.`);
    }

    // Mapping UI strings to your database's unique baseLoss values
    const UI_TO_BASE_LOSS: Record<string, number> = {
        'Very Easy': 0.75,
        'Easy': 1.5,
        'Medium': 2.25,
        'Hard': 3.0,
        'Very Hard': 3.75
    };

    const whiteStats = new Set(Object.keys(player.stats).filter(stat => isWhiteStat(player.role, stat)));

    let availableDrills = DRILL_LIST;

    // 1. FILTERING: Use the mapping to find drills matching the UI tab's difficulty
    if (uiDrillFilter && uiDrillFilter !== 'All') {
        const targetLoss = UI_TO_BASE_LOSS[uiDrillFilter];
        if (targetLoss) {
            availableDrills = DRILL_LIST.filter(d => d.baseLoss === targetLoss);
        }
    }

    return availableDrills.map(drill => {
        // 2. MATH: We use 'Very Easy' as a multiplier (1.0) because the 
        // drill's intrinsic baseLoss already contains the difficulty weight.
        const actualLoss = calculateActualLoss(drill.baseLoss, fanClubLevel, 'Very Easy');

        const isZeroDrain = actualLoss < 0.5;
        const whiteDrillStats = drill.stats.filter(s => whiteStats.has(s.toUpperCase()));

        // 3. ROBUSTNESS: Prevent NaN and handle Zero-Drain boundary
        const efficiency = drill.stats.length > 0 ? (whiteDrillStats.length / drill.stats.length) * 100 : 0;
        const conditionCost = isZeroDrain ? 0 : actualLoss;

        // ROI Calculation
        const vals = whiteDrillStats.map(s => player.stats[s]).filter((v): v is number => v !== undefined);
        const avgWhiteStatValue = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : Infinity;

        return {
            name: drill.name,
            type: drill.type,
            efficiency,
            conditionCost,
            isZeroDrain,
            avgWhiteStatValue,
            statsHit: drill.stats,
            whiteHits: drill.stats.map(stat => ({ stat, white: whiteStats.has(stat.toUpperCase()) })),
        };
    })
    .sort((a, b) => {
        // Rank by ROI: Cheapest gains (lowest white stat average) first
        if (a.avgWhiteStatValue !== b.avgWhiteStatValue) return a.avgWhiteStatValue - b.avgWhiteStatValue;
        return b.efficiency - a.efficiency;
    });
}

// Aliases for backward compatibility with existing tests
export const getBestDrillSelections = getRecommendedDrills;
export const getDrillRecommendations = getRecommendedDrills;
