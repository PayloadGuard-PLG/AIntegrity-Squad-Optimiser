import readline from 'readline';
import { loadPlayers } from './services/storageService';
import { getBestDrillSelections } from './logic/controller';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function startApp() {
    const players = await loadPlayers();
    console.log("\n--- AIntegrity Squad Optimiser ---");
    
    rl.question("1. View Squad\n2. Optimise Player\n3. Exit\nSelection: ", async (choice) => {
        if (choice === '1') {
            console.table(players.map(p => ({ name: p.name, roles: p.role.join('/') })));
            startApp();
        } else if (choice === '2') {
            rl.question("Enter Player Name: ", (name) => {
                const p = players.find(player => player.name === name);
                if (p) {
                    // Defaulting to Fan Club Level 4 as per your screenshot
                    console.table(getBestDrillSelections(p, 4));
                }
                startApp();
            });
        } else {
            process.exit();
        }
    });
}
startApp();
