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
    // Try to reuse existing token if possible
    const tokenFile = path.join(DATA_DIR, 'kis_token.json');
    if (fs.existsSync(tokenFile)) {
        try {
            const saved = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
            if (saved.expiry > Date.now() + 3600000) return saved.token;
        } catch(e) {}
    }
    // Auth logic needs to try both production and VTS if unsure, but server usually uses production
    try {
        const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: 'client_credentials', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET
        });
        return response.data.access_token;
    } catch(e) {
        // Fallback to VTS for dev
        const response = await axios.post('https://openapivts.koreainvestment.com:29443/oauth2/tokenP', {
            grant_type: 'client_credentials', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET
        });
        return response.data.access_token;
    }
}

async function fixAllEodPrices() {
    console.log('[FixEOD] Starting 350 stocks EOD verification...');
    const token = await getKisAccessToken();
    const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));
    
    let liveCache = {};
    if (fs.existsSync(FULL_PRICE_FILE)) liveCache = JSON.parse(fs.readFileSync(FULL_PRICE_FILE, 'utf8'));
    
    let signals = [];
    if (fs.existsSync(SIGNALS_FILE)) signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));

    // 🔴 [v6.7.0] Naver Scraper Fallback (Replacing unreliable Yahoo)
    async function getNaverPrice(symbol) {
        try {
            const url = `https://finance.naver.com/item/main.naver?code=${symbol}`;
            const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const html = res.data;
            // Precise regex to avoid picking up sidebar prices
            const match = html.match(/<div class="today">[\s\S]*?<span class="tah p11">([\d,]+)<\/span>/);
            if (match) return parseInt(match[1].replace(/,/g, ''));
            // Meta tag second fallback
            const meta = html.match(/<meta property="og:description" content="[^"]*현재가 ([\d,]+)/);
            if (meta) return parseInt(meta[1].replace(/,/g, ''));
        } catch (e) {}
        return null;
    }

    for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        let finalClose = liveCache[stock.code]?.price || 0;
        let finalHigh = liveCache[stock.code]?.high || 0;
        let finalOpen = liveCache[stock.code]?.open || 0;
        let finalLow = liveCache[stock.code]?.low || 0;
        let changeRate = liveCache[stock.code]?.change_rate || 0;

        try {
            const url = `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-price`;
            const res = await axios.get(url, {
                headers: {
                    'authorization': 'Bearer ' + token,
                    'appkey': KIS_APP_KEY,
                    'appsecret': KIS_APP_SECRET,
                    'tr_id': 'FHKST01010400'
                },
                params: {
                    "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock.code, "FID_PERIOD_DIV_CODE": "D", "FID_ORG_ADJ_PRC": "0"
                }
            });

            if (res.data.output && res.data.output[0]) {
                const latest = res.data.output[0];
                finalClose = parseInt(latest.stck_clpr);
                finalHigh = parseInt(latest.stck_hgpr);
                finalLow = parseInt(latest.stck_lwpr);
                finalOpen = parseInt(latest.stck_oprc);
                changeRate = parseFloat(latest.prdy_ctrt);
                console.log(`[FixEOD] KIS Match: ${stock.name}(${stock.code}) -> ${finalClose}`);
            } else {
                throw new Error("KIS Empty Output");
            }
        } catch (e) {
            console.warn(`[FixEOD] KIS Failed for ${stock.code}. Trying Naver...`);
            const nPrice = await getNaverPrice(stock.code);
            if (nPrice) {
                finalClose = nPrice;
                console.log(`[FixEOD] Naver Match: ${stock.name}(${stock.code}) -> ${finalClose}`);
            } else {
                console.error(`[FixEOD] EVERYTHING FAILED for ${stock.code}`);
            }
        }


        if (finalClose > 0) {
            if (!liveCache[stock.code]) liveCache[stock.code] = {};
            liveCache[stock.code].price = finalClose;
            liveCache[stock.code].change_rate = changeRate;
            liveCache[stock.code].updated_at = Date.now();
            signals.forEach(sig => { if (sig.code === stock.code) sig.current_price = finalClose; });
        }
        await sleep(200);
    }

    // 🔴 [v7.1.0] Rebuild Overrides from scratch for safety (Pure Dynamic)
    const OVERRIDES_FILE = path.join(DATA_DIR, 'manual_overrides.json');
    let manualOverrides = {};
    Object.keys(liveCache).forEach(code => {
        const data = liveCache[code];
        manualOverrides[code] = {
            price: data.price,
            rate: data.change_rate,
            sign: data.change_rate >= 0 ? "2" : "5",
            change: 0
        };
    });

    fs.writeFileSync(FULL_PRICE_FILE, JSON.stringify(liveCache, null, 2));
    fs.writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2));
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(manualOverrides, null, 2));
    console.log('[FixEOD] v6.7.0 Completed! All files re-synchronized and frozen.');
}

fixAllEodPrices().catch(console.error);
