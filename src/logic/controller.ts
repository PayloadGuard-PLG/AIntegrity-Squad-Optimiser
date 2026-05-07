import { isEssentialGain, validateRoleAdjacency } from '../utils/roleWeights';
import { DRILL_LIST } from '../database/drillDatabase';
import { calculateActualLoss } from '../utils/conditionEngine';
import { Player } from '../database/playerSchema';

export const getRecommendedDrills = (player: Player, fanClubLevel: number = 4) =>
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

        return {
            Drill: drill.name,
            Efficiency: `${(efficiency * 100).toFixed(0)}%`,
            'Cost (6x Slot)': `${(actualLoss * 6).toFixed(2)}%`,
            'White Stats Hit': hits.join(', ')
        };
    })
    .filter(d => parseFloat(d.Efficiency) >= 50)
    .sort((a, b) => parseFloat(b.Efficiency) - parseFloat(a.Efficiency));
}
