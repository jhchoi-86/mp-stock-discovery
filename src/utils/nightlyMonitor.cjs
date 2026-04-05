const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '../../data');
const PAST_REC_FILE = path.join(DATA_DIR, 'past_recommendations.json');
const LIVE_PRICE_FILE = path.join(DATA_DIR, 'live_prices.json');

const alertCache = new Map();

async function pollRealTimePrices(getKisAccessToken, useCache = null) {
    const kstOffset = 9 * 60 * 60 * 1000;
    const nowKST = new Date(Date.now() + kstOffset);
    
    const day = nowKST.getUTCDay(); 
    const hours = nowKST.getUTCHours();
    const minutes = nowKST.getUTCMinutes();
    const timeNum = hours * 100 + minutes;

    console.log(`[NightlyMonitor] Heartbeat - KST: ${hours}:${minutes}, Day: ${day}`);

    if (day === 0 || day === 6) return;

    let shouldPoll = false;
    if (timeNum >= 830 && timeNum <= 840) shouldPoll = true;
    if (timeNum >= 900 && timeNum <= 1800) shouldPoll = true;
    const isPostJune2026 = nowKST.getUTCFullYear() > 2026 || (nowKST.getUTCFullYear() === 2026 && nowKST.getUTCMonth() >= 5);
    if (isPostJune2026 && timeNum > 1800 && timeNum <= 2000) shouldPoll = true;

    if (!shouldPoll) return;
    if (!fs.existsSync(PAST_REC_FILE)) return;

    let pastRecs = [];
    try {
        pastRecs = JSON.parse(fs.readFileSync(PAST_REC_FILE, 'utf8'));
    } catch (e) {
        return;
    }

    if (!pastRecs || pastRecs.length === 0) return;

    let kisToken = null;
    const API_KEY = process.env.KIS_APP_KEY;
    const API_SECRET = process.env.KIS_APP_SECRET;
    const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELE_IDS = typeof process.env.TELEGRAM_CHAT_ID === 'string' ? process.env.TELEGRAM_CHAT_ID.split(',').map(s=>s.trim()).filter(s=>s) : [];

    let livePrices = {};
    if (fs.existsSync(LIVE_PRICE_FILE)) {
        try { livePrices = JSON.parse(fs.readFileSync(LIVE_PRICE_FILE, 'utf8')); } catch (e) {}
    }

    for (const rec of pastRecs) {
        try {
            let currentPrice = null;
            let lowPrice = 9999999;

            // [v6.2.5] Use Cache if available (from WSS or FullPoller)
            if (useCache) {
                const cached = useCache(rec.code);
                if (cached && cached.price) {
                    currentPrice = cached.price;
                    // Low price is hard to get from WSS unless we track it. 
                    // But for hit detection, currentPrice is priority.
                }
            }

            // Fallback to REST if no cache or price is old
            if (!currentPrice) {
                if (!kisToken) kisToken = await getKisAccessToken();
                const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
                const kisRes = await axios.get(kisUrl, {
                    headers: { 'authorization': 'Bearer ' + kisToken, 'appkey': API_KEY, 'appsecret': API_SECRET, 'tr_id': 'FHKST01010100' },
                    params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": rec.code },
                    timeout: 5000
                });
                
                if (kisRes.data && kisRes.data.output && kisRes.data.output.stck_prpr) {
                    currentPrice = parseInt(kisRes.data.output.stck_prpr);
                    lowPrice = parseInt(kisRes.data.output.stck_lwpr || "9999999");
                }
                // Rate limit respect
                await new Promise(r => setTimeout(r, 500));
            }
            
            if (currentPrice) {
                const isHit = (currentPrice <= rec.rec_price) || (lowPrice <= rec.rec_price);
                let hitAt = livePrices[rec.code]?.hit_at || null;
                if (isHit && !hitAt) hitAt = Date.now();

                livePrices[rec.code] = { price: currentPrice, is_hit: isHit, hit_at: hitAt, updated_at: Date.now() };
                
                // console.log(`[NightlyMonitor] ${useCache && useCache(rec.code) ? '(Cache)' : '(REST)'} Update: ${rec.name} -> ${currentPrice}`);

                // Alerting Logic
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
                                text: `🚨 [타점 도달] ${rec.name} (${rec.code}): ${currentPrice.toLocaleString()}원` 
                            }).catch(()=>{});
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`[NightlyMonitor] Error for ${rec.code}:`, e.message);
        }
    }

    if (Object.keys(livePrices).length > 0) {
        fs.writeFileSync(LIVE_PRICE_FILE, JSON.stringify(livePrices, null, 2));
    }
}

function startNightlyMonitor(getKisTokenFunc, config = {}, useCache = null) {
    console.log('[NightlyMonitor] Hybrid Polling initialized (v6.2.5)');
    async function runLoop() {
        try { await pollRealTimePrices(getKisTokenFunc, useCache); } catch(e) { console.error('[NightlyMonitor Loop Error]', e.message); }
        // If using cache, we can poll more frequently (e.g. 5s) without cost
        setTimeout(runLoop, useCache ? 5000 : 30000); 
    }
    runLoop();
}

module.exports = { startNightlyMonitor };
