const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '../../data');
const PAST_REC_FILE = path.join(DATA_DIR, 'past_recommendations.json');
const LIVE_PRICE_FILE = path.join(DATA_DIR, 'live_prices.json');

const alertCache = new Map();

async function pollRealTimePrices(getKisAccessToken) {
    const kstOffset = 9 * 60 * 60 * 1000;
    const nowKST = new Date(Date.now() + kstOffset);
    
    const day = nowKST.getUTCDay(); 
    const hours = nowKST.getUTCHours();
    const minutes = nowKST.getUTCMinutes();
    const timeNum = hours * 100 + minutes;

    console.log(`[NightlyMonitor] Heartbeat - KST: ${hours}:${minutes}, Day: ${day}`);

    if (day === 0 || day === 6) return;
    if (timeNum < 859 || timeNum > 2000) return;

    if (!fs.existsSync(PAST_REC_FILE)) return;

    let pastRecs = [];
    try {
        pastRecs = JSON.parse(fs.readFileSync(PAST_REC_FILE, 'utf8'));
    } catch (e) {
        return;
    }

    if (!pastRecs || pastRecs.length === 0) return;

    let kisToken;
    try {
        kisToken = await getKisAccessToken();
    } catch(e) {
        console.error('[NightlyMonitor] KIS Token Error:', e.message);
        return;
    }
    
    const API_KEY = process.env.KIS_APP_KEY;
    const API_SECRET = process.env.KIS_APP_SECRET;
    const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELE_IDS = typeof process.env.TELEGRAM_CHAT_ID === 'string' ? process.env.TELEGRAM_CHAT_ID.split(',').map(s=>s.trim()).filter(s=>s) : [];

    // Load existing live prices to preserve hit status
    let livePrices = {};
    if (fs.existsSync(LIVE_PRICE_FILE)) {
        try { livePrices = JSON.parse(fs.readFileSync(LIVE_PRICE_FILE, 'utf8')); } catch (e) {}
    }

    for (const rec of pastRecs) {
        try {
            const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
            const kisRes = await axios.get(kisUrl, {
                headers: {
                    'authorization': 'Bearer ' + kisToken,
                    'appkey': API_KEY,
                    'appsecret': API_SECRET,
                    'tr_id': 'FHKST01010100'
                },
                params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": rec.code },
                timeout: 5000
            });
            
            if (kisRes.data && kisRes.data.output && kisRes.data.output.stck_prpr) {
                const currentPrice = parseInt(kisRes.data.output.stck_prpr);
                const lowPrice = parseInt(kisRes.data.output.stck_lwpr || "9999999");
                
                // Logic: A hit is valid if Current Price is <= Entry OR if Day's Low was ever <= Entry.
                const isHit = (currentPrice <= rec.rec_price) || (lowPrice <= rec.rec_price);
                
                // Track when it first hit (preserve existing)
                let hitAt = livePrices[rec.code]?.hit_at || null;
                if (isHit && !hitAt) {
                    hitAt = Date.now();
                }

                livePrices[rec.code] = { 
                    price: currentPrice, 
                    is_hit: isHit,
                    hit_at: hitAt,
                    updated_at: Date.now() 
                };
                
                console.log(`[NightlyMonitor] Live Update: ${rec.name} (${rec.code}) -> Cur: ${currentPrice}, Low: ${lowPrice}, Hit: ${isHit}`);

                // Alerting Logic (0.1% Proximity)
                const alertKey = `${rec.code}_${rec.date}`;
                const alertStatus = alertCache.get(alertKey) || { count: 0, lastAlert: 0 };
                if (alertStatus.count < 3 && Date.now() - alertStatus.lastAlert >= 5 * 60 * 1000) {
                    const diffPerc = Math.abs(currentPrice - rec.rec_price) / rec.rec_price;
                    if (diffPerc <= 0.001) {
                        alertStatus.count += 1; alertStatus.lastAlert = Date.now();
                        alertCache.set(alertKey, alertStatus);
                        for (const chatId of TELE_IDS) {
                            axios.post(`https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`, { 
                                chat_id: chatId, 
                                text: `🚨 [타점 도달] ${rec.name} (${rec.code}): ${currentPrice.toLocaleString()}원 (오차율 ${(diffPerc*100).toFixed(2)}%)` 
                            }).catch(()=>{});
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`[NightlyMonitor] Error for ${rec.code}:`, e.message);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (Object.keys(livePrices).length > 0) {
        fs.writeFileSync(LIVE_PRICE_FILE, JSON.stringify(livePrices, null, 2));
    }
}

function startNightlyMonitor(getKisTokenFunc) {
    console.log('[NightlyMonitor] Real-time Polling initialized (v4.6.3)');
    async function runLoop() {
        try { await pollRealTimePrices(getKisTokenFunc); } catch(e) { console.error('[NightlyMonitor Loop Error]', e.message); }
        setTimeout(runLoop, 10000);
    }
    runLoop();
}

module.exports = { startNightlyMonitor };
