import { GameProfile, TeamPlayPillar, TeamPlayPlan, FixtureWindow, GreensBridgeSuggestion } from '../types/resources';

export function calculateFixtureCycles(
  hoursUntilFixture: number,
  cooldownMins: number,
  sessionsPerCycle: number = 6
): FixtureWindow {
  const cycles = Math.floor((hoursUntilFixture * 60) / cooldownMins);
  return { cycles, totalSessions: cycles * sessionsPerCycle };
}

export function calculateTeamPlayPlan(
  pillars: Partial<Record<TeamPlayPillar, number>>,
  matchAdvisorActive: boolean,
  profile: GameProfile
): TeamPlayPlan {
  const freeDrillsNeeded = matchAdvisorActive ? 0 : profile.teamPlayFreeDrillsPerDay;
  const matchAdvisorCoversDecay = matchAdvisorActive;
  const recommendation = matchAdvisorActive
    ? 'Match Advisor active — all drill sessions advance team play. No separate maintenance drills needed.'
    : `Watch ${profile.teamPlayFreeDrillsPerDay} Reward Channel videos daily to run free team play drills and offset the ${profile.teamPlayDecayPerDay}-point daily decay per pillar.`;
  return {
    pillars,
    decayPerDay: profile.teamPlayDecayPerDay,
    freeDrillsNeeded,
    matchAdvisorCoversDecay,
    recommendation,
  };
}

export function calculateGreensBridge(
  availableGreens: number,
  naturalCycles: number,
  profile: GameProfile
): GreensBridgeSuggestion {
  const cyclesPerGreen = Math.floor(profile.conditionPerGreen / profile.conditionCostPerDrill);
  const additionalCycles = availableGreens * cyclesPerGreen;
  const worthwhile = additionalCycles > 0 && naturalCycles > 0;
  const note = worthwhile
    ? `${availableGreens} green${availableGreens !== 1 ? 's' : ''} → +${additionalCycles} extra cycle${additionalCycles !== 1 ? 's' : ''} (${cyclesPerGreen} per green · ${profile.conditionPerGreen}% restored / ${profile.conditionCostPerDrill}% per drill)`
    : availableGreens === 0
      ? 'No greens available — bridge not possible.'
      : 'Set fixture window to evaluate bridge value.';
  return {
    greensNeeded: availableGreens,
    additionalCycles,
    worthwhile,
    note,
  };
}
