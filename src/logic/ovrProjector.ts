import { getTierAttrAddition, getTierCost } from '../utils/math';
import { isWhiteStat, getWhiteStatKeys } from '../utils/roleWeights';
import { estimateStatGainPct, applyTierBonusToStats, statsToQualityPct, qualityPctToOvr } from './xpEngine';
import { DrillSession, GameProfile, TalentTier, DrillLevel, TierName, InvestmentStep } from '../types/resources';
import { Player } from '../database/playerSchema';
import { DRILL_LIST } from '../database/drillDatabase';

export { getTierAttrAddition as getTierBonus, getTierCost };

/**
 * Finds a drill by name (case-insensitive). Returns null if not found.
 */
function findDrill(drillName: string) {
  return DRILL_LIST.find(d => d.name.toLowerCase() === drillName.toLowerCase()) ?? null;
}

/**
 * Returns current OVR from player.stats via Quality%/4.
 * Falls back to player.overall when stats are empty (e.g. first add, no stats entered).
 */
export function computeOvrFromStats(player: Player, profile: GameProfile): number {
  if (Object.keys(player.stats).length === 0) return player.overall;
  const qp = statsToQualityPct(player.stats, profile);
  return qualityPctToOvr(qp, profile);
}

/**
 * Applies a set of drill sessions to a mutable copy of the player's stats.
 * Returns the stat delta map, step log, and new OVR.
 *
 * Each session = 1 XP unit. Star decay is applied per-stat within the session.
 * (Cross-stat star decay interaction is a calibration TODO.)
 */
export function applyDrillSessionsToStats(
  player: Player,
  drillSessions: DrillSession[],
  talentTier: TalentTier,
  twoxAdActive: boolean,
  profile: GameProfile
): { steps: InvestmentStep[]; updatedStats: Record<string, number>; finalOvr: number } {
  const steps: InvestmentStep[] = [];
  const updatedStats = { ...player.stats };
  const ovrBefore = computeOvrFromStats(player, profile);
  let runningOvr = ovrBefore;

  for (const session of drillSessions) {
    const drill = findDrill(session.drillName);
    if (!drill) continue;

    const drillLevelMult = profile.drillLevelMultipliers[session.drillLevel] ?? 1.0;
    const statDeltas: string[] = [];

    for (const statKey of drill.stats) {
      const normalized = statKey.toUpperCase();
      const currentVal = updatedStats[normalized] ?? 0;
      if (currentVal >= profile.statCap) continue;

      const isWhite = isWhiteStat(player.role, normalized);
      const gainPct = estimateStatGainPct(
        session.sessionCount,
        currentVal,
        player.age,
        0,
        talentTier,
        isWhite,
        twoxAdActive,
        drillLevelMult,
        profile
      );

      if (gainPct > 0) {
        updatedStats[normalized] = Math.min(currentVal + gainPct, profile.statCap);
        statDeltas.push(`${normalized} +${gainPct}%`);
      }
    }

    if (statDeltas.length > 0) {
      const newQp = statsToQualityPct(updatedStats, profile);
      const newOvr = qualityPctToOvr(newQp, profile);
      const ovrDelta = Number((newOvr - runningOvr).toFixed(1));
      steps.push({
        action: 'drill',
        description: `${session.drillName} ×${session.sessionCount} sessions (${session.drillLevel})`,
        ovrBefore: runningOvr,
        ovrAfter: newOvr,
        resourcesUsed: `${session.sessionCount} sessions`,
      });
      runningOvr = newOvr;
      void ovrDelta; // tracked via ovrBefore/ovrAfter
    }
  }

  return { steps, updatedStats, finalOvr: runningOvr };
}

/**
 * Full OVR projection chain:
 *   1. Drill sessions (always first — drills before tier)
 *   2. Tier upgrade (flat per-white-attr addition → recompute Quality% → OVR)
 *   3. Greens (informational only — condition restore, NOT OVR)
 */
export function projectOvr(
  player: Player,
  drillSessions: DrillSession[],
  talentTier: TalentTier,
  drillLevel: DrillLevel,
  targetTier: TierName | null,
  greens: number,
  twoxAdActive: boolean,
  profile: GameProfile
): { steps: InvestmentStep[]; finalOvr: number; warnings: string[] } {
  const steps: InvestmentStep[] = [];
  const warnings: string[] = [];

  // Promote all sessions to the specified drill level if not already set per-session
  const sessions: DrillSession[] = drillSessions.map(s => ({
    ...s,
    drillLevel: s.drillLevel ?? drillLevel,
  }));

  // When individual stats are absent, fall back to analytical tier-only projection.
  // Drill simulation requires per-stat baseline values; without them it would compute
  // from 0, producing a completely wrong OVR.
  if (Object.keys(player.stats).length === 0) {
    warnings.push('Enter individual stat values for drill-level OVR projection.');
    let currentOvr = player.overall;

    if (sessions.length > 0) {
      warnings.push('Drill gains skipped — individual stats required.');
    }

    if (player.age >= 20) {
      warnings.push(`Slow trainer (age ${player.age}) — gains are reduced.`);
    }

    if (targetTier && targetTier !== player.tier && targetTier !== 'None') {
      const tierCost = getTierCost(targetTier);
      const whiteKeys = getWhiteStatKeys(player.role);
      const attrAdd = getTierAttrAddition(targetTier);
      const tierOvrGain = Number(
        (attrAdd * whiteKeys.length / (profile.totalAttributeCount * profile.qualityOvrDivisor)).toFixed(1)
      );
      const ovrBefore = currentOvr;
      currentOvr = Number((currentOvr + tierOvrGain).toFixed(1));
      steps.push({
        action: 'tier',
        description: `Tier → ${targetTier} (+${attrAdd} per white attr × ${whiteKeys.length} stats)`,
        ovrBefore,
        ovrAfter: currentOvr,
        resourcesUsed: `${tierCost} tier points`,
      });
    }

    if (greens > 0) {
      const condPct = Math.min(greens * 15, 100);
      steps.push({
        action: 'condition',
        description: `${greens} greens → +${condPct}% condition restored`,
        ovrBefore: currentOvr,
        ovrAfter: currentOvr,
        resourcesUsed: `${greens} greens`,
      });
    }

    return { steps, finalOvr: currentOvr, warnings };
  }

  // Step 1 — Drill sessions
  let currentStats = { ...player.stats };
  let currentOvr = computeOvrFromStats(player, profile);

  if (sessions.length > 0) {
    const { steps: drillSteps, updatedStats, finalOvr: postDrillOvr } =
      applyDrillSessionsToStats({ ...player, stats: currentStats }, sessions, talentTier, twoxAdActive, profile);
    steps.push(...drillSteps);
    currentStats = updatedStats;
    currentOvr = postDrillOvr;
  } else {
    warnings.push('No drill sessions — add drills to project OVR growth.');
  }

  if (player.age >= 20) {
    warnings.push(`Slow trainer (age ${player.age}) — gains are reduced.`);
  }

  // Step 2 — Tier upgrade
  if (targetTier && targetTier !== player.tier && targetTier !== 'None') {
    const tierCost = getTierCost(targetTier);
    const whiteKeys = getWhiteStatKeys(player.role);
    const ovrBefore = currentOvr;

    currentStats = applyTierBonusToStats(currentStats, whiteKeys, targetTier, profile);
    const newQp = statsToQualityPct(currentStats, profile);
    const newOvr = qualityPctToOvr(newQp, profile);
    const attrAdd = getTierAttrAddition(targetTier);

    steps.push({
      action: 'tier',
      description: `Tier → ${targetTier} (+${attrAdd} per white attr × ${whiteKeys.length} stats)`,
      ovrBefore,
      ovrAfter: newOvr,
      resourcesUsed: `${tierCost} tier points`,
    });
    currentOvr = newOvr;
  }

  // Step 3 — Greens (condition restore — no OVR change)
  if (greens > 0) {
    const condPct = Math.min(greens * 15, 100);
    steps.push({
      action: 'condition',
      description: `${greens} greens → +${condPct}% condition restored`,
      ovrBefore: currentOvr,
      ovrAfter: currentOvr,
      resourcesUsed: `${greens} greens`,
    });
  }

  return { steps, finalOvr: currentOvr, warnings };
}
