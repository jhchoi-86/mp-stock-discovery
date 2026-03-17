const fs = require('fs');
const axios = require('axios');

const MASTER_FILE = 'data/stock_master.json';
const UPDATE_FILE = 'update_master.cjs';

async function run() {
    console.log("Starting Naver Mobile API UTF-8 Name Fetcher...");
    const masterData = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
    let updateCode = fs.readFileSync(UPDATE_FILE, 'utf8');
    
    let changed = false;
    
    for (const stock of masterData) {
        try {
            // Naver mobile API returns clean UTF-8 JSON
            const url = `https://m.stock.naver.com/api/stock/${stock.code}/integration`;
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36'
                }
            });
            
            if (res.data && res.data.stockName) {
                const cleanName = res.data.stockName;
                if (stock.name !== cleanName) {
                    console.log(`[FIXED] ${stock.code}: ${stock.name} -> ${cleanName}`);
                    stock.name = cleanName;
                    changed = true;
                    
                    // Replace or add to update_master.cjs dictionary string
                    // We need to safely find the existing dictionary entry or append it
                    const regex = new RegExp(`"${stock.code}"\\s*:\\s*"[^"]*"`);
                    if (regex.test(updateCode)) {
                        updateCode = updateCode.replace(regex, `"${stock.code}": "${cleanName}"`);
                    } else {
                        // Insert if missing
                        updateCode = updateCode.replace(
                            /};(\s*const finalUniverse = \[\];)/,
                            `    "${stock.code}": "${cleanName}",\n};\n$1`
                        );
                    }
                }
            }
        } catch (e) {
            console.error(`Error fetching ${stock.code}:`, e.message);
        }
        await new Promise(r => setTimeout(r, 100)); // 100ms delay to be safe
    }
    
    if (changed) {
        fs.writeFileSync(MASTER_FILE, JSON.stringify(masterData, null, 2));
        fs.writeFileSync(UPDATE_FILE, updateCode);
        console.log(`\nSUCCESS: Fixed formatting for all corrupted names using pure UTF-8!`);
    } else {
        console.log(`\nOK: All names are already perfect.`);
    }
}

run();
