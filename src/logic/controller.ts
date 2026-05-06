import { calculateEfficiency } from '../utils/optimiserMath';
import { isEssentialGain, validateRoleAdjacency } from '../utils/roleWeights';
import { Player } from '../database/playerSchema';

export function getRecommendedDrills(player: Player) {
    if (!validateRoleAdjacency(player.role)) {
        throw new Error(`Invalid combination: Roles must be adjacent and cannot bridge with GK.`);
    }

    const recommendations = [];
    for (const [stat, value] of Object.entries(player.stats)) {
        const essential = isEssentialGain(player.role, stat);
        const efficiency = calculateEfficiency(value, essential);
        
        if (essential && efficiency > 0.6) {
            recommendations.push({ stat, priority: 'HIGH', efficiency });
        }
    }
    return recommendations.sort((a, b) => b.efficiency - a.efficiency);
}
