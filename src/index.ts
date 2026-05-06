import readline from 'readline';
import { loadPlayers, savePlayers } from './services/storageService';
import { getBestDrillSelections } from './logic/controller';
import { planPlayerInvestment } from './logic/investmentEngine';
import { compareInvestmentScenarios } from './logic/scenarioComparator';
import { ROLE_CONSTRAINTS, validateRoleAdjacency } from './utils/roleWeights';
import { Player } from './database/playerSchema';
import { Coach, ManagerProfile, ManagerStyle, TierName } from './types/resources';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>(res => rl.question(q, res));

function buildDefaultStats(roles: string[]): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const role of roles.slice(0, 3)) {
    const roleData = ROLE_CONSTRAINTS[role.toUpperCase()];
    if (!roleData) continue;
    for (const s of roleData.essential) stats[s] = stats[s] ?? 100;
    for (const s of roleData.secondary) stats[s] = stats[s] ?? 80;
  }
  return stats;
}

async function collectCoaches(): Promise<Coach[]> {
  const coaches: Coach[] = [];
  console.log("\nEnter available coaches (blank name to finish):");
  let idx = 0;
  while (true) {
    const type = await ask("  Coach type (Attacking/Defending/Physical/Mixed/Focused) or blank to finish: ");
    if (!type.trim()) break;

    const multiplierStr = await ask("  Multiplier (e.g. 30): ");
    const sessionStr = await ask("  Session type (Training/Seminar) [Training]: ");
    const attrsStr = await ask("  Attributes trained (comma-separated, or blank for defaults): ");
    const sourceStr = await ask("  Source (Academy/EliteChest/Store/Other) [Academy]: ");
    const costStr = await ask("  Cost (e.g. '150 tokens' or 'free') [free]: ");

    const coachType = type.trim() as Coach['type'];
    const multiplier = parseInt(multiplierStr, 10) || 30;
    const sessionType = sessionStr.trim() === 'Seminar' ? 'Seminar' : 'Training';
    const source = (sourceStr.trim() || 'Academy') as Coach['source'];

    let attributes: string[] = [];
    if (attrsStr.trim()) {
      attributes = attrsStr.split(',').map(a => a.trim().toUpperCase());
    } else {
      // Default attributes by type
      const defaults: Record<string, string[]> = {
        Attacking: ['PASSING', 'DRIBBLING', 'CROSSING', 'SHOOTING', 'FINISHING'],
        Defending: ['BRAVERY', 'HEADING', 'MARKING', 'POSITIONING', 'TACKLING'],
        Physical:  ['AGGRESSION', 'CREATIVITY', 'FITNESS', 'SPEED', 'STRENGTH'],
        Mixed:     ['PASSING', 'DRIBBLING', 'TACKLING', 'MARKING'],
        Focused:   ['POSITIONING'],
      };
      attributes = defaults[coachType] ?? [];
    }

    let cost: Coach['cost'] = { currency: 'free', amount: 0 };
    const costParts = costStr.trim().toLowerCase().split(' ');
    if (costParts[0] !== 'free' && costParts.length === 2) {
      cost = { currency: costParts[1] as 'tokens' | 'cash', amount: parseInt(costParts[0], 10) };
    }

    coaches.push({
      id: `c${++idx}`,
      type: coachType,
      sessionType,
      multiplier,
      attributes,
      durationDays: 1,
      source,
      cost,
    });
  }
  return coaches;
}

async function startApp() {
  const players = await loadPlayers();
  console.log("\n--- AIntegrity Squad Optimiser ---");

  const choice = await ask("1. View Squad\n2. Drill Optimiser\n3. Add Player\n4. Plan Investment\n5. Compare Players\n6. Exit\nSelection: ");

  if (choice === '1') {
    if (players.length === 0) {
      console.log("No players yet. Add one first.");
    } else {
      console.table(players.map(p => ({
        Name: p.name,
        Roles: p.role.join('/'),
        Age: p.age,
        OVR: p.overall,
        Tier: p.tier ?? 'None',
        Mutant: p.isMutantCandidate ? 'Yes' : 'No',
      })));
    }
    startApp();

  } else if (choice === '2') {
    const name = await ask("Enter Player Name: ");
    const p = players.find(pl => pl.name.toLowerCase() === name.toLowerCase());
    if (p) {
      console.log(`\nDrill Recommendations for ${p.name} (Fan Club Lvl 4):\n`);
      console.table(getBestDrillSelections(p, 4));
    } else {
      console.log(`Player "${name}" not found.`);
    }
    startApp();

  } else if (choice === '3') {
    const name = await ask("Player Name: ");
    const rolesInput = await ask("Role(s) [e.g. ST  or  DC,DMC]: ");
    const roles = rolesInput.split(',').map(r => r.trim().toUpperCase());
    if (!validateRoleAdjacency(roles)) {
      console.log(`❌ Invalid role combo: ${roles.join('+')} — roles must be adjacent.`);
      startApp();
      return;
    }
    const ageStr = await ask("Age: ");
    const ovrStr = await ask("Overall Rating: ");
    const tierInput = await ask("Tier (None/Rare/Elite/Stellar/Master/Epic/Legendary) [None]: ");
    const mutStr = await ask("Mutant Candidate? (y/n): ");

    const newPlayer: Player = {
      id: Date.now().toString(),
      name,
      role: roles,
      age: parseInt(ageStr, 10),
      overall: parseFloat(ovrStr),
      tier: (tierInput.trim() || 'None') as TierName,
      stats: buildDefaultStats(roles),
      isMutantCandidate: mutStr.toLowerCase() === 'y',
    };
    await savePlayers([...players, newPlayer]);
    console.log(`✔ ${name} added to squad (${roles.join('/')}, ${newPlayer.tier} tier).`);
    startApp();

  } else if (choice === '4') {
    if (players.length === 0) { console.log("Add a player first."); startApp(); return; }
    console.table(players.map((p, i) => ({ '#': i + 1, Name: p.name, OVR: p.overall, Age: p.age })));
    const idxStr = await ask("Select player # to plan: ");
    const player = players[parseInt(idxStr, 10) - 1];
    if (!player) { console.log("Invalid selection."); startApp(); return; }

    const coaches = await collectCoaches();
    const tierInput = await ask("Target tier (None/Rare/Elite/Stellar/Master/Epic/Legendary) or blank to skip: ");
    const tierPointsStr = await ask("Available tier points: ");
    const greensStr = await ask("Available greens: ");
    const styleInput = await ask("Manager style (FTP/Hybrid/PTW) [PTW]: ");
    const sponsorInput = await ask("Premium sponsor? (y/n) [n]: ");
    const budgetStr = await ask("Store budget in tokens (0 for FTP, blank = unlimited): ");

    const targetTier = tierInput.trim() ? (tierInput.trim() as TierName) : null;
    const profile: ManagerProfile = {
      style: ((styleInput.trim() || 'PTW') as ManagerStyle),
      coaches,
      tierPoints: parseInt(tierPointsStr, 10) || 0,
      greens: parseInt(greensStr, 10) || 0,
      isPremiumSponsor: sponsorInput.toLowerCase() === 'y',
      storeBudget: budgetStr.trim() ? parseInt(budgetStr, 10) : undefined,
    };

    const plan = planPlayerInvestment(player, profile, targetTier);
    console.log(`\n=== Investment Plan: ${plan.player.name} ===`);
    console.table(plan.steps.map(s => ({
      Action: s.action,
      Description: s.description.substring(0, 55),
      'OVR Before': s.ovrBefore,
      'OVR After': s.ovrAfter,
      Resources: s.resourcesUsed,
    })));
    console.log(`\nFinal OVR: ${plan.finalOvr}  (+${plan.totalOvrGain})`);
    console.log(`\n${plan.recommendation}`);
    if (plan.warnings.length) plan.warnings.forEach(w => console.log(`⚠  ${w}`));
    startApp();

  } else if (choice === '5') {
    if (players.length < 2) { console.log("Need at least 2 players to compare."); startApp(); return; }
    console.table(players.map((p, i) => ({ '#': i + 1, Name: p.name, OVR: p.overall, Age: p.age })));
    const indicesStr = await ask("Enter player numbers to compare (comma-separated, e.g. 1,2): ");
    const selectedPlayers = indicesStr.split(',')
      .map(s => players[parseInt(s.trim(), 10) - 1])
      .filter(Boolean);
    if (selectedPlayers.length < 2) { console.log("Invalid selection."); startApp(); return; }

    const coaches = await collectCoaches();
    const tierInput = await ask("Target tier (or blank): ");
    const tierPointsStr = await ask("Tier points: ");
    const greensStr = await ask("Greens: ");
    const styleInput = await ask("Manager style (FTP/Hybrid/PTW) [PTW]: ");
    const sponsorInput = await ask("Premium sponsor? (y/n) [n]: ");

    const targetTier = tierInput.trim() ? (tierInput.trim() as TierName) : null;
    const profile: ManagerProfile = {
      style: ((styleInput.trim() || 'PTW') as ManagerStyle),
      coaches,
      tierPoints: parseInt(tierPointsStr, 10) || 0,
      greens: parseInt(greensStr, 10) || 0,
      isPremiumSponsor: sponsorInput.toLowerCase() === 'y',
    };

    const comparison = compareInvestmentScenarios(selectedPlayers, profile, targetTier);
    console.log('\n=== Scenario Comparison ===');
    console.table(comparison.results.map(r => ({
      Rank: r.rank,
      Player: r.playerName,
      'Current OVR': r.currentOvr,
      'Projected OVR': r.projectedOvr,
      'OVR Gain': r.ovrGain,
    })));
    console.log(`\n✔ Recommended: ${comparison.recommendedPlayer}`);
    console.log(`   ${comparison.reasoning}`);
    startApp();

  } else {
    rl.close();
    process.exit();
  }
}

startApp();
