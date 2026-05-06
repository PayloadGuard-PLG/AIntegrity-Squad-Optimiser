import { planPlayerInvestment } from '../src/logic/investmentEngine';
import { compareInvestmentScenarios } from '../src/logic/scenarioComparator';
import { ManagerProfile, Coach } from '../src/types/resources';
import { Player } from '../src/database/playerSchema';

console.log("--- AIntegrity Investment Engine Test ---\n");

// --- Shared resource pool (the user's actual situation) ---
// Elite Chest coaches: Standard Attacking ×30, Defending ×40, Physical ×28
const eliteChestCoaches: Coach[] = [
  {
    id: 'c1', type: 'Attacking', sessionType: 'Training', multiplier: 30,
    attributes: ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING'],
    durationDays: 1, source: 'EliteChest', cost: { currency: 'free', amount: 0 },
  },
  {
    id: 'c2', type: 'Defending', sessionType: 'Training', multiplier: 40,
    attributes: ['BRAVERY', 'HEADING', 'MARKING', 'POSITIONING', 'TACKLING'],
    durationDays: 1, source: 'EliteChest', cost: { currency: 'free', amount: 0 },
  },
  {
    id: 'c3', type: 'Physical', sessionType: 'Training', multiplier: 28,
    attributes: ['AGGRESSION', 'CREATIVITY', 'FITNESS', 'SPEED', 'STRENGTH'],
    durationDays: 1, source: 'EliteChest', cost: { currency: 'free', amount: 0 },
  },
];

const premiumProfile: ManagerProfile = {
  style: 'PTW',
  coaches: eliteChestCoaches,
  tierPoints: 650,          // Enough for Stellar (600 pts)
  greens: 100,
  isPremiumSponsor: true,
};

// --- Player A: 18yo Striker (user's main candidate) ---
const youngStriker: Player = {
  id: '1', name: 'Alpha Striker', role: ['ST', 'AMC'],
  age: 18, overall: 120, tier: 'None',
  stats: {
    FINISHING: 115, SHOOTING: 110, DRIBBLING: 105,
    PASSING: 97, POSITIONING: 90, HEADING: 85,
    STRENGTH: 80, SPEED: 105, CREATIVITY: 75,
  },
  isMutantCandidate: true,
};

// --- Player B: Youth Academy GK (competing candidate) ---
const youthGK: Player = {
  id: '2', name: 'Academy GK', role: ['GK'],
  age: 17, overall: 88, tier: 'None',
  stats: {
    REFLEXES: 95, AGILITY: 88, ANTICIPATION: 82,
    'RUSHING OUT': 75, COMMUNICATION: 70,
    FITNESS: 85, THROWING: 72,
  },
  isMutantCandidate: false,
};

// --- Test 1: Single player plan ---
console.log("[Test 1] Investment plan — Alpha Striker (18yo, OVR 120) with Elite Chest coaches → Stellar\n");
const strikerPlan = planPlayerInvestment(youngStriker, premiumProfile, 'Stellar');
console.log(`Player: ${strikerPlan.player.name} | Current OVR: ${strikerPlan.player.currentOvr}`);
console.log("\nStep-by-step:");
console.table(strikerPlan.steps.map(s => ({
  Action: s.action,
  Description: s.description.substring(0, 60),
  'OVR Before': s.ovrBefore,
  'OVR After': s.ovrAfter,
  Resources: s.resourcesUsed,
})));
console.log(`\nFinal OVR: ${strikerPlan.finalOvr} (+${strikerPlan.totalOvrGain})`);
console.log(`Recommendation: ${strikerPlan.recommendation}`);
if (strikerPlan.warnings.length) console.log(`Warnings: ${strikerPlan.warnings.join('; ')}`);

// --- Test 2: Scenario comparison ---
console.log("\n\n[Test 2] Scenario comparison — Striker vs GK for same resource pool\n");
const comparison = compareInvestmentScenarios([youngStriker, youthGK], premiumProfile, 'Stellar');
console.table(comparison.results.map(r => ({
  Rank: r.rank,
  Player: r.playerName,
  'Current OVR': r.currentOvr,
  'Projected OVR': r.projectedOvr,
  'OVR Gain': r.ovrGain,
})));
console.log(`\nRecommended: ${comparison.recommendedPlayer}`);
console.log(`Reasoning: ${comparison.reasoning}`);

// --- Test 3: FTP manager (no store coaches) ---
console.log("\n\n[Test 3] FTP manager — same player, only Academy coaches\n");
const ftpProfile: ManagerProfile = {
  ...premiumProfile,
  style: 'FTP',
  coaches: [
    // FTP player only has the free Academy Standard Attacking ×30
    { ...eliteChestCoaches[0], source: 'Academy' },
  ],
  greens: 0,
  isPremiumSponsor: false,
};
const ftpPlan = planPlayerInvestment(youngStriker, ftpProfile, 'Stellar');
console.log(`FTP projection — Final OVR: ${ftpPlan.finalOvr} (+${ftpPlan.totalOvrGain})`);
console.log(`Recommendation: ${ftpPlan.recommendation}`);

console.log("\n--- Investment Engine Test Complete ---");
