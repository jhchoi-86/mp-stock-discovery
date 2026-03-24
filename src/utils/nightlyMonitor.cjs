const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');

const DATA_DIR = path.join(__dirname, '../../data');
const PAST_REC_FILE = path.join(DATA_DIR, 'past_recommendations.json');

// Store alerted state to prevent spam. (Cleared naturally when server restarts or manually if needed, 
// but perfectly safe because past_recommendations.json gets deleted and recreated with a new date each night)
const alertCache = new Map();

async function pollRealTimePrices(getKisAccessToken) {
    // Only run between 09:00 and 15:30 on weekdays
    const now = new Date();
    // KST is UTC + 9
    const kstTemp = new Date(now.getTime() + 9 * 3600 * 1000);
    const day = kstTemp.getUTCDay(); // 0(Sun) - 6(Sat)
    const hours = kstTemp.getUTCHours();
    const minutes = kstTemp.getUTCMinutes();
    
    if (day === 0 || day === 6) return; // Weekend
    
    const timeNum = hours * 100 + minutes;
    if (timeNum < 859 || timeNum > 1530) return; // Out of market hours (added 8:59 buffer)

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
        console.error('[NightlyMonitor] Exception getting KIS token:', e.message);
        return;
    }
    
    const API_KEY = process.env.KIS_APP_KEY;
    const API_SECRET = process.env.KIS_APP_SECRET;
    const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELE_IDS = typeof process.env.TELEGRAM_CHAT_ID === 'string' ? process.env.TELEGRAM_CHAT_ID.split(',').map(s=>s.trim()).filter(s=>s) : [];

    // Using official KIS API for 0-delay current prices
    // Auto-Sync is now serialized, so we will never hit the 20/s API rate limit here.

    for (const rec of pastRecs) {
        // Skip already alerted for this specific date
        // e.g. "005930_2026-03-23"
        const alertKey = `${rec.code}_${rec.date}`;
        const alertStatus = alertCache.get(alertKey) || { count: 0, lastAlert: 0 };
        
        // 1. Hard limit: Max 3 times per day per stock
        if (alertStatus.count >= 3) continue;
        
        // 2. Cooldown: 5 minutes between alerts for the same stock
        if (Date.now() - alertStatus.lastAlert < 5 * 60 * 1000) continue;

            let currentPrice = null;
            let currentOpenPrice = null;
            let currentVolumeRate = null;
            try {
                const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
                const kisRes = await axios.get(kisUrl, {
                    headers: {
                        'authorization': 'Bearer ' + kisToken,
                        'appkey': API_KEY,
                        'appsecret': API_SECRET,
                        'tr_id': 'FHKST01010100'
                    },
                    params: {
                        "FID_COND_MRKT_DIV_CODE": "J",
                        "FID_INPUT_ISCD": rec.code
                    }
                });
                if (kisRes.data && kisRes.data.output && kisRes.data.output.stck_prpr) {
                    currentPrice = parseInt(kisRes.data.output.stck_prpr);
                    currentOpenPrice = parseInt(kisRes.data.output.stck_oprc || "0");
                    currentVolumeRate = parseFloat(kisRes.data.output.prdy_vrss_vol_rate || "0");
                }
            } catch (e) {
                console.error(`[NightlyMonitor KIS Fetch Error for ${rec.code}]:`, e.response?.data || e.message);
                continue;
            }
            
            if (!currentPrice || currentPrice <= 0) continue;

            if (currentPrice > 0 && rec.rec_price > 0) {
                // Calculate absolute difference percentage
                const diffPerc = Math.abs(currentPrice - rec.rec_price) / rec.rec_price;
                
                if (diffPerc <= 0.001) {
                    
                    // --- [Volume Spike Down Circuit Breaker] ---
                    if (currentOpenPrice > 0 && currentVolumeRate >= 150) {
                        const dropFromOpenPerc = (currentOpenPrice - currentPrice) / currentOpenPrice;
                        if (dropFromOpenPerc >= 0.02) {
                            alertStatus.count = 3; 
                            alertStatus.lastAlert = Date.now();
                            alertCache.set(alertKey, alertStatus);
                            
                            const tvLink = `https://kr.tradingview.com/chart/?symbol=KRX:${rec.code}`;
                            const msg = `⚠️ [서킷 브레이커 발동 - 스나이퍼 매수 차단]\n\n📌 종목: ${rec.name} (${rec.code})\n🚨 사유: 쏟아지는 악재성 투매 감지\n(전일비 거래량 ${currentVolumeRate}% 터지며 시가대비 -${(dropFromOpenPerc*100).toFixed(2)}% 장대음봉 진행중)\n\n알고리즘이 거대한 위험을 감지하여 자동 매수 타겟에서 당일 영구 제외(Block) 처리했습니다.\n📈 차트보기: ${tvLink}`;
                            
                            for (const chatId of TELE_IDS) {
                                try {
                                    const url = `https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`;
                                    await axios.post(url, { chat_id: chatId, text: msg }, { httpsAgent: new https.Agent({ family: 4 }) });
                                } catch (e) { console.error('[Telegram CB Error]:', e.message); }
                            }
                            console.log(`[NightlyMonitor] Circuit Breaker activated for ${rec.name} (Vol: ${currentVolumeRate}%, Drop: ${(dropFromOpenPerc*100).toFixed(2)}%)`);
                            continue;
                        }
                    }
                    // --- [End Circuit Breaker] ---

                    // Update cache state
                    alertStatus.count += 1;
                    alertStatus.lastAlert = Date.now();
                    alertCache.set(alertKey, alertStatus);
                    
                    const remaining = 3 - alertStatus.count;
                    const limitNote = remaining > 0 ? `\n🔔 (알림 ${alertStatus.count}/3회 - 다음 알림 최소 5분 뒤)` : `\n🚫 (일일 최대 3회 알림 도달 - 당일 모니터링 종료)`;
                    
                    const tvLink = `https://kr.tradingview.com/chart/?symbol=KRX:${rec.code}`;
                    
                    // Fire telegram alert
                    const msg = `🚨 [단타/스윙 타점 도달]\n\n📌 종목: ${rec.name} (${rec.code})\n💰 현재가: ${currentPrice.toLocaleString()}원\n🎯 매수타점: ${rec.rec_price.toLocaleString()}원\n📊 오차율: ${(diffPerc * 100).toFixed(2)}%${limitNote}\n📈 차트보기: ${tvLink}\n\n⚠️ 법적 고지: 본 알람은 자동 매매가 아닌 우량 종목 발굴(추천) 및 단순 정보 제공용입니다. 실제 매매의 판단과 투자 결과에 대한 모든 법적 책임은 투자자 본인에게 있습니다.`;

                    for (const chatId of TELE_IDS) {
                        try {
                            const url = `https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`;
                            await axios.post(url, { chat_id: chatId, text: msg }, { httpsAgent: new https.Agent({ family: 4 }) });
                        } catch (e) {
                            console.error(`[NightlyMonitor Telegram Error]:`, e.message);
                        }
                    }
                    console.log(`[NightlyMonitor] Sent target alert for ${rec.name} at ${currentPrice}원`);
                }
            }
        

        // 1000ms delay between KIS api requests to guarantee we never hit 20 req/s limit
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

function startNightlyMonitor(getKisTokenFunc) {
    console.log('[NightlyMonitor] Real-time 0.1% Entry Sniper Monitoring initialized (sequential 10s polling)');
    
    async function runLoop() {
        try {
            await pollRealTimePrices(getKisTokenFunc);
        } catch(e) {
             console.error('[NightlyMonitor Critical Error]', e.message);
        }
        
        // Schedule next execution 10 seconds AFTER the current one completely finishes
        setTimeout(runLoop, 10000);
    }
    
    // Start tracking
    runLoop();
}

module.exports = {
    startNightlyMonitor
};
