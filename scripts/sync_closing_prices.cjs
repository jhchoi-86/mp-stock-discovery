const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '../data');
const FULL_PRICE_FILE = path.join(DATA_DIR, 'live_prices_full.json');
const MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');

async function syncAll() {
    const API_KEY = process.env.KIS_APP_KEY;
    const API_SECRET = process.env.KIS_APP_SECRET;

    console.log('--- Force Sync ALL 350 Stocks v3 ---');

    // 1. Get Token
    let token;
    try {
        const res = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: "client_credentials",
            appkey: API_KEY,
            appsecret: API_SECRET
        });
        token = res.data.access_token;
        console.log('Token ready.');
    } catch (e) {
        console.error('Token Failed:', e.message);
        return;
    }

    // 2. Load all codes
    let codes = [];
    try {
        const master = JSON.parse(fs.readFileSync(MASTER_FILE, 'utf8'));
        codes = master.map(s => s.code);
        console.log(`Master loaded: ${codes.length} symbols.`);
    } catch (e) {
        console.error('Failed to load master:', e.message);
        return;
    }

    // 3. Load existing cache
    let cache = {};
    if (fs.existsSync(FULL_PRICE_FILE)) {
        cache = JSON.parse(fs.readFileSync(FULL_PRICE_FILE, 'utf8'));
    }

    // 4. Batch Processing (to stay under rate limits)
    console.log('Starting fetch...');
    let successCount = 0;
    
    for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        try {
            const res = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price', {
                headers: {
                    'authorization': 'Bearer ' + token,
                    'appkey': API_KEY,
                    'appsecret': API_SECRET,
                    'tr_id': 'FHKST01010100'
                },
                params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code },
                timeout: 3000
            });
            
            const out = res.data.output;
            if (out) {
                const price = parseInt(out.stck_prpr, 10);
                const change = parseFloat(out.prdy_ctrt);
                cache[code] = {
                    ...cache[code],
                    price: price,
                    change_rate: change,
                    updated_at: Date.now()
                };
                successCount++;
                if (i % 50 === 0) console.log(`Progress: ${i}/${codes.length}...`);
            }
        } catch (e) {
            // Ignore error for individual symbols
        }
        await new Promise(r => setTimeout(r, 150)); // ~7 calls per second
    }

    // 5. Save
    fs.writeFileSync(FULL_PRICE_FILE, JSON.stringify(cache, null, 2));
    console.log(`Sync Complete. Updated ${successCount} stocks. live_prices_full.json saved.`);
}

syncAll();
