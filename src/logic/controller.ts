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
    const isZeroDrain = fanClubLevel === 4 && drillLevel === 'Very Easy';

    return DRILL_LIST.map(drill => {
        const actualLoss = calculateActualLoss(drill.baseLoss, fanClubLevel);
        const efficiency = drill.stats.filter(s => whiteStats.includes(s)).length / drill.stats.length;
        const conditionCost = isZeroDrain ? 0 : actualLoss * 6;

        return {
            name: drill.name,
            type: drill.type,
            efficiency,
            conditionCost,
            isZeroDrain,
            whiteHits: drill.stats.map(stat => ({ stat, white: whiteStats.includes(stat) })),
        };
    })
    .filter(d => d.efficiency >= 0.5)
    .sort((a, b) => b.efficiency - a.efficiency);
}
