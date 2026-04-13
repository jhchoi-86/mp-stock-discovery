const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const CACHE_FILE = path.join(DATA_DIR, 'live_prices_full.json');

async function main() {
    if (!fs.existsSync(MASTER_FILE) || !fs.existsSync(CACHE_FILE)) {
        console.log('Files missing');
        return;
    }

    const master = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));

    const sampleCodes = ['005930', '000660', '095610', '222800', '042700'];
    
    console.log('=== Price/Master Alignment Audit ===');
    sampleCodes.forEach(code => {
        const m = master.find(s => s.code === code);
        const c = cache[code];
        if (m && c) {
            console.log(`[${code}] ${m.name.padEnd(10)} | Cache Price: ${String(c.price).padStart(8)} | Time: ${new Date(c.updated_at).toLocaleString()}`);
        } else {
            console.log(`[${code}] Data missing for ${m ? m.name : 'Unknown'}`);
        }
    });

    console.log('\n=== Random Cache Check (Are prices reasonable?) ===');
    const allCodes = Object.keys(cache);
    allCodes.slice(0, 5).forEach(code => {
        const m = master.find(s => s.code === code);
        console.log(`[${code}] ${m ? m.name.padEnd(10) : '???'.padEnd(10)} | Price: ${cache[code].price}`);
    });
}

main();
