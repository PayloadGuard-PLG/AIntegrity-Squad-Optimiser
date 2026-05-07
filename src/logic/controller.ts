import { isEssentialGain, validateRoleAdjacency } from '../utils/roleWeights';
import { DRILL_LIST } from '../database/drillDatabase';
import { calculateActualLoss } from '../utils/conditionEngine';
import { Player } from '../database/playerSchema';

export const getRecommendedDrills = (player: Player, fanClubLevel: number = 4) =>
    getDrillRecommendations(player, fanClubLevel);

export const getDrillRecommendations = (player: Player, fanClubLevel: number = 4) =>
    getBestDrillSelections(player, fanClubLevel);

export function getBestDrillSelections(player: Player, fanClubLevel: number = 4) {
    if (!validateRoleAdjacency(player.role)) {
        throw new Error(`Invalid combination: Roles must be adjacent.`);
    }

    const whiteStats = Object.keys(player.stats).filter(stat => isEssentialGain(player.role, stat));

    return DRILL_LIST.map(drill => {
        const hits = drill.stats.filter(s => whiteStats.includes(s));
        const actualLoss = calculateActualLoss(drill.baseLoss, fanClubLevel);
        const efficiency = hits.length / drill.stats.length;
        const conditionCost = actualLoss * 6;

        return {
            name: drill.name,
            type: drill.type,
            efficiency,
            conditionCost,
            isZeroDrain: conditionCost === 0,
            whiteHits: drill.stats.map(stat => ({ stat, white: whiteStats.includes(stat) })),
        };
    })
    .filter(d => d.efficiency >= 0.5)
    .sort((a, b) => b.efficiency - a.efficiency);
}
