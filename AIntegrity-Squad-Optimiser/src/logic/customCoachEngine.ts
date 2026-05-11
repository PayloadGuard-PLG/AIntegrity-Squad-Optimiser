import { calculateDynamicGain } from '../utils/coachMath';

export interface PlayerStats {
  age: number;
  tier: string;
  ovr: number;
  roles: string[];
}

/**
 * Predicts drill effect with custom multipliers
 */
export function predictCustomDrill(
  player: PlayerStats,
  coachMultiplier: number,
  sessions: number,
  targetSkillIsWhite: boolean
) {
  const gainPerSession = calculateDynamicGain(
    coachMultiplier,
    player.age,
    targetSkillIsWhite,
    player.ovr
  );

  const totalGain = gainPerSession * sessions;
  
  return {
    gainPerSession,
    totalGain: Number(totalGain.toFixed(2)),
    projectedOvr: Number((player.ovr + totalGain).toFixed(2)),
    warning: player.age > 25 ? "Slow Trainer: Low Efficiency" : null
  };
}
