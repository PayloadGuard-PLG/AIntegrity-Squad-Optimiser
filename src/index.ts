import readline from 'readline';
import { loadPlayers, savePlayers } from './services/storageService';
import { getRecommendedDrills } from './logic/controller';
import { Player } from './database/playerSchema';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const menu = `
--- AIntegrity Squad Optimiser ---
1. View Squad
2. Add Player
3. Get Training Recommendations
4. Exit
Selection: `;

async function startApp() {
    const players = await loadPlayers();

    const ask = () => {
        rl.question(menu, async (choice) => {
            if (choice === '1') {
                console.table(players.map(p => ({ name: p.name, roles: p.role.join(','), ovr: p.overall })));
                ask();
            } else if (choice === '3') {
                rl.question("Enter Player ID to optimise: ", (id) => {
                    const p = players.find(player => player.id === id);
                    if (p) {
                        console.log(`\nRecommendations for ${p.name}:`);
                        console.table(getRecommendedDrills(p));
                    } else {
                        console.log("Player not found.");
                    }
                    ask();
                });
            } else if (choice === '4') {
                process.exit();
            } else {
                console.log("Option coming soon for PC...");
                ask();
            }
        });
    };
    ask();
}

startApp();
