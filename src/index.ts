import readline from 'readline';
import { loadPlayers, savePlayers } from './services/storageService';
import { getBestDrillSelections } from './logic/controller';
import { ROLE_CONSTRAINTS, validateRoleAdjacency } from './utils/roleWeights';
import { Player } from './database/playerSchema';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

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

async function startApp() {
    const players = await loadPlayers();
    console.log("\n--- AIntegrity Squad Optimiser ---");

    rl.question("1. View Squad\n2. Optimise Player\n3. Add Player\n4. Exit\nSelection: ", async (choice) => {
        if (choice === '1') {
            if (players.length === 0) {
                console.log("No players yet. Add one first.");
            } else {
                console.table(players.map(p => ({
                    Name: p.name,
                    Roles: p.role.join('/'),
                    Age: p.age,
                    OVR: p.overall,
                    Mutant: p.isMutantCandidate ? 'Yes' : 'No'
                })));
            }
            startApp();

        } else if (choice === '2') {
            rl.question("Enter Player Name: ", (name) => {
                const p = players.find(player => player.name.toLowerCase() === name.toLowerCase());
                if (p) {
                    console.log(`\nDrill Recommendations for ${p.name} (Fan Club Lvl 4):\n`);
                    console.table(getBestDrillSelections(p, 4));
                } else {
                    console.log(`Player "${name}" not found.`);
                }
                startApp();
            });

        } else if (choice === '3') {
            rl.question("Player Name: ", (name) => {
                rl.question("Role(s) [e.g. ST  or  DC,DMC]: ", (rolesInput) => {
                    const roles = rolesInput.split(',').map(r => r.trim().toUpperCase());
                    if (!validateRoleAdjacency(roles)) {
                        console.log(`❌ Invalid role combo: ${roles.join('+')} — roles must be adjacent.`);
                        startApp();
                        return;
                    }
                    rl.question("Age: ", (ageStr) => {
                        rl.question("Overall Rating: ", (ovrStr) => {
                            rl.question("Mutant Candidate? (y/n): ", async (mutStr) => {
                                const newPlayer: Player = {
                                    id: Date.now().toString(),
                                    name,
                                    role: roles,
                                    age: parseInt(ageStr, 10),
                                    overall: parseFloat(ovrStr),
                                    stats: buildDefaultStats(roles),
                                    isMutantCandidate: mutStr.toLowerCase() === 'y'
                                };
                                await savePlayers([...players, newPlayer]);
                                console.log(`✔ ${name} added to squad (${roles.join('/')}).`);
                                startApp();
                            });
                        });
                    });
                });
            });

        } else {
            rl.close();
            process.exit();
        }
    });
}

startApp();
