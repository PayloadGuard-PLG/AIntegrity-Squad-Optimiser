import { isWhiteStat, validateRoleAdjacency, getWhiteStatKeys } from '../utils/roleWeights';
import { DRILL_LIST } from '../database/drillDatabase';
import { calculateActualLoss, rawDrillDrain } from '../utils/conditionEngine';
import { SurgeState, SURGE_STATE_SEASON_START } from '../types/resources';
import { Player } from '../database/playerSchema';
import { FanLevel, GameProfile } from '../types/resources';
import gameProfileJson from '../../profiles/game_2025.json';

const profile = gameProfileJson as unknown as GameProfile;

export function getRecommendedDrills(
    player: Player,
    surge: SurgeState = SURGE_STATE_SEASON_START
) {
    if (!validateRoleAdjacency(player.role)) {
        throw new Error(`Invalid combination: Roles must be adjacent.`);
    }

    const whiteStats = new Set(getWhiteStatKeys(player.role));

    return DRILL_LIST.map(drill => {
        // Charged cost: never zero. The 0% drain loophole was patched; drills
        // below the floor are charged the 1% minimum, not made free.
        const rawLoss = rawDrillDrain(drill.baseLoss, drill.intensity, surge);
        const actualLoss = calculateActualLoss(drill.baseLoss, drill.intensity, surge);
        const isFloored = actualLoss > rawLoss;
        const whiteDrillStats = drill.stats.filter(s => whiteStats.has(s.toUpperCase()));
        const efficiency = drill.stats.length > 0 ? whiteDrillStats.length / drill.stats.length : 0;
        const conditionCost = actualLoss;
        // No free-drill branch: conditionCost >= MIN_CONDITION_DRAIN_PCT whenever a
        // drill runs, so ROI is always a real ratio.
        const roi = efficiency / conditionCost;

        const vals = whiteDrillStats.map(s => player.stats[s]).filter((v): v is number => v !== undefined);
        const avgWhiteStatValue = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : Infinity;

        return {
            name: drill.name,
            type: drill.type,
            intensity: drill.intensity,
            efficiency,
            conditionCost,
            rawLoss,
            isFloored,
            roi,
            avgWhiteStatValue,
            statsHit: drill.stats,
            whiteHits: drill.stats.map(stat => ({ stat, white: whiteStats.has(stat.toUpperCase()) })),
        };
    })
    .sort((a, b) => b.roi - a.roi);
}

// Aliases for backward compatibility with existing tests
export const getBestDrillSelections = getRecommendedDrills;
export const getDrillRecommendations = getRecommendedDrills;
