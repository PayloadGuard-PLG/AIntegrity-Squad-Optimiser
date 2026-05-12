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

export function calculateRestorersBridge(
  availableRestorers: number,
  naturalCycles: number,
  profile: GameProfile
): GreensBridgeSuggestion {
  const cyclesPerRestorer = Math.floor(profile.conditionPerRestorer / profile.conditionCostPerDrill);
  const additionalCycles = availableRestorers * cyclesPerRestorer;
  const worthwhile = additionalCycles > 0 && naturalCycles > 0;
  const note = worthwhile
    ? `${availableRestorers} restorer${availableRestorers !== 1 ? 's' : ''} → +${additionalCycles} extra cycle${additionalCycles !== 1 ? 's' : ''} (${cyclesPerRestorer} per restorer · ${profile.conditionPerRestorer}% restored / ${profile.conditionCostPerDrill}% per drill)`
    : availableRestorers === 0
      ? 'No restorers available — bridge not possible.'
      : 'Set fixture window to evaluate bridge value.';
  return {
    restorersNeeded: availableRestorers,
    additionalCycles,
    worthwhile,
    note,
  };
}
