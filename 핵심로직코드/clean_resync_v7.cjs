require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();
const DATA_DIR = path.join(__dirname, '..', 'data');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const FULL_PRICE_FILE = path.join(DATA_DIR, 'live_prices_full.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getKisAccessToken() {
    const tokenFile = path.join(DATA_DIR, 'kis_token.json');
    if (fs.existsSync(tokenFile)) {
        try {
            const saved = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
            if (saved.expiry > Date.now() + 3600000) return saved.token;
        } catch(e) {}
    }
    const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        grant_type: 'client_credentials', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET
    });
    return response.data.access_token;
}

async function cleanResync() {
    console.log('[CleanSync] Starting v7.0.0 Full Price Purge & Resync...');
    const token = await getKisAccessToken();
    const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));
    
    // 🔴 [v7.0.0] WIPE CORRUPTED CACHE
    let liveCache = {}; // Start fresh to remove corruption
    let signals = [];
    if (fs.existsSync(SIGNALS_FILE)) signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));

    const url = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';

    for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        let success = false;
        let retryCount = 0;

        while (!success && retryCount < 2) {
            try {
                const res = await axios.get(url, {
                    headers: {
                        'authorization': 'Bearer ' + token,
                        'appkey': KIS_APP_KEY,
                        'appsecret': KIS_APP_SECRET,
                        'tr_id': 'FHKST01010100'
                    },
                    params: {
                        "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock.code
                    }
                });

                if (res.data.output && res.data.output.stck_prpr) {
                    const latest = res.data.output;
                    const price = parseInt(latest.stck_prpr);
                    const rate = parseFloat(latest.prdy_ctrt);
                    
                    liveCache[stock.code] = {
                        price: price,
                        high: parseInt(latest.stck_hgpr),
                        low: parseInt(latest.stck_lwpr),
                        open: parseInt(latest.stck_oprc),
                        change_rate: rate,
                        updated_at: Date.now()
                    };

                    // Update signals as well
                    signals.forEach(sig => { if (sig.code === stock.code) sig.current_price = price; });
                    
                    console.log(`[CleanSync] [${i+1}/350] ${stock.name}(${stock.code}) -> ${price} (${rate}%)`);
                    success = true;
                } else {
                    throw new Error("Empty Result");
                }
            } catch (e) {
                retryCount++;
                console.warn(`[CleanSync] Failed ${stock.code} (Try ${retryCount}/2): ${e.message}`);
                await sleep(1000);
            }
        }

        await sleep(250); // Respect TPS (10 per second)
    }

    // Atomic Save
    fs.writeFileSync(FULL_PRICE_FILE, JSON.stringify(liveCache, null, 2));
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2));
    
    // Delete overrides once more just in case
    const OVERRIDES_FILE = path.join(DATA_DIR, 'manual_overrides.json');
    if (fs.existsSync(OVERRIDES_FILE)) fs.unlinkSync(OVERRIDES_FILE);

    console.log('[CleanSync] v7.0.0 Completed! Corruption Purged. System is Clean.');
}

cleanResync().catch(console.error);
