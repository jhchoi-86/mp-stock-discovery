require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { calculateSignals } = require('./analyzer.cjs');
const { calculateTotalScore } = require('./src/utils/scoreEngine.cjs');
const { sendTelegramMessage } = require('./telegramBot.cjs');
const { toKST, getKSTDateString } = require('./src/utils/kst.cjs'); // [TASK-CC02] KST 공통 유틸 도입

const DATA_DIR = path.join(__dirname, 'data');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const KIS_TOKEN_FILE = path.join(DATA_DIR, 'kis_token.json');

// --- [Phase 5] SSOT Integration ---
const prisma = require('./src/utils/prismaClient.cjs');
const cache = require('./src/services/cacheService.cjs');
const ScoringService = require('./src/services/ScoringService.cjs');

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();

// Target Stocks: Top 10 by Star Grade from PostgreSQL SSOT
let targetStocks = [];
let alertedCandles = new Set(); 
let lastResetDate = getKSTDateString(); // [TASK-CC02] KST 기준 날짜

/**
 * [Phase 5] DB SSOT 기반 타겟 종목 식별 (signals.json 제거)
 */
async function identifyTargetStocks() {
    try {
        console.log('[Sniper 3M] Identifying targets from PostgreSQL...');
        const snapshots = await prisma.dailyStockSnapshot.findMany({
            where: { 
                starGrade: { 
                    not: null,
                    notIn: ['0', '', 'nullable'] 
                } 
            },
            orderBy: [
                { starGrade: 'desc' },
                { createdAt: 'desc' }
            ],
            take: 10
        });

        return snapshots.map(s => ({
            code: s.code,
            name: s.name,
            score: parseInt(s.starGrade || 0)
        }));
    } catch (e) {
        console.error('[Sniper 3M] DB Target identification failed:', e.message);
        return [];
    }
}

async function fetch3MCandles(code, token) {
    const url = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice';
    const res = await axios.get(url, {
        headers: { 
            'content-type': 'application/json',
            'authorization': 'Bearer ' + token, 
            'appkey': KIS_APP_KEY, 
            'appsecret': KIS_APP_SECRET, 
            'tr_id': 'FHKST03010200', 
            'custtype': 'P' 
        },
        params: {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": code,
            "FID_ETC_CLS_CODE": "",
            "FID_PW_DATA_INCU_YN": "Y",
            "FID_HOUR_CLS_CODE": "3" // 3-minute
        }
    });

    const output2 = res.data.output2;
    if (!output2 || output2.length < 50) return null;

    // KIS returns newest first. Reverse for analyzer.
    const reversed = [...output2].reverse();
    const baseDateStr = res.data.output1.stck_bsop_date; // YYYYMMDD
    
    return {
        open: reversed.map(d => parseInt(d.stck_oprc)),
        high: reversed.map(d => parseInt(d.stck_hgpr)),
        low: reversed.map(d => parseInt(d.stck_lwpr)),
        close: reversed.map(d => parseInt(d.stck_prpr)),
        volume: reversed.map(d => parseInt(d.cntg_vol)),
        time: reversed.map(d => {
            // [TASK-N04] Handle date per record if available, fallback to baseDate
            const dateStr = d.stck_bsop_date || baseDateStr; 
            const h = d.stck_cntg_hour.substring(0, 2);
            const m = d.stck_cntg_hour.substring(2, 4);
            const s = d.stck_cntg_hour.substring(4, 6);
            return Math.floor(new Date(`${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}T${h}:${m}:${s}Z`).getTime() / 1000);
        })
    };
}

async function getKisAccessToken() {
    try {
        if (fs.existsSync(KIS_TOKEN_FILE)) {
            const data = fs.readFileSync(KIS_TOKEN_FILE, 'utf8');
            try {
                const saved = JSON.parse(data);
                if (saved.token && saved.expiry > Date.now() + 3600000) return saved.token;
            } catch (pErr) {
                console.warn("[Sniper 3M] Token file corrupted. Issuing new token...");
            }
        }
    } catch (fErr) {
        console.warn("[Sniper 3M] Token file read error:", fErr.message);
    }

    const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        grant_type: 'client_credentials', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET
    });
    const token = response.data.access_token;
    const expiry = Date.now() + (response.data.expires_in * 1000);
    
    try {
        fs.writeFileSync(KIS_TOKEN_FILE, JSON.stringify({ token, expiry }));
    } catch (wErr) {
        console.error("[Sniper 3M] Failed to save token to file (Memory only):", wErr.message);
    }
    return token;
}

let running = true;
process.on('SIGTERM', () => { 
    console.log('[Sniper 3M] SIGTERM received. Shutting down...');
    running = false; 
});
process.on('SIGINT',  () => { 
    console.log('[Sniper 3M] SIGINT received. Shutting down...');
    running = false; 
});

async function runSniper() {
    console.log(`[Sniper 3M] Starting engine at ${new Date().toLocaleString()}`);
    
    // [TASK-E05] Send ready signal to PM2
    if (process.send) {
        process.send('ready');
        console.log('[PM2] Sent ready signal.');
    }

    let token;
    try { token = await getKisAccessToken(); } catch(e) { console.error("KIS Token missing"); return; }
    
    targetStocks = await identifyTargetStocks();
    console.log(`[Sniper 3M] Target Stocks: ${targetStocks.map(s => s.name).join(', ')}`);

    while (running) {
        try {
            // Market check (09:00 - 15:40 KST)
            const kstHeader = toKST(); // [TASK-CC02] 공통 유틸 사용
            const hour = kstHeader.getHours();
            const min = kstHeader.getMinutes();

            // [TASK-N06] Daily Reset for alertedCandles
            const today = getKSTDateString();
            if (today !== lastResetDate) {
                console.log(`[Sniper 3M] Daily reset of alertedCandles Cache (${lastResetDate} -> ${today})`);
                alertedCandles.clear();
                lastResetDate = today;
            }

            // Extended Market Hours support (up to 20:00)
            const isMarketOpen = (hour > 9 || (hour === 9 && min >= 0)) && (hour < 20 || (hour === 20 && min <= 0));
            
            if (!isMarketOpen) {
                console.log(`[Sniper 3M] Market Closed (${hour}:${min}). Waiting...`);
                await new Promise(r => setTimeout(r, 60000));
                continue;
            }

            // Refresh targets periodically (every hour)
            if (kstHeader.getMinutes() === 0 && kstHeader.getSeconds() < 40) {
                targetStocks = await identifyTargetStocks();
            }

            for (const stock of targetStocks) {
                if (!running) break;
                try {
                    const history = await fetch3MCandles(stock.code, token);
                    if (history) {
                        const signal = calculateSignals(history, '3M');
                        if (signal && signal.is_strong_signal) {
                            const lastTs = history.time[history.time.length - 1];
                            const alertKey = `${stock.code}_${lastTs}`;
                            
                             if (!alertedCandles.has(alertKey)) {
                                // [v9.4.31] Prefer real-time price from Redis if available
                                let displayPrice = signal.current_price;
                                try {
                                    const cached = await redis.get(`realtime:price:${stock.code}`);
                                    if (cached) {
                                        const rData = JSON.parse(cached);
                                        if (Date.now() - rData.updatedAt < 300000) { // Valid for 5 min
                                            displayPrice = rData.price;
                                        }
                                    }
                                } catch (e) {}

                                console.log(`[Sniper 3M] ALERT! ${stock.name} (${stock.code}) Absolute Signal at ${displayPrice}`);
                                const msg = `🎯 [스나이퍼-3M 절대신호]\n종목: ${stock.name}\n현재가: ${displayPrice.toLocaleString()}원\n전략: 전일 추천주 실시간 돌파 포착`;
                                
                                // [TASK-N08] Retry logic for Telegram
                                let sent = false;
                                for (let attempt = 1; attempt <= 3; attempt++) {
                                    try {
                                        await sendTelegramMessage(msg);
                                        sent = true;
                                        break;
                                    } catch (err) {
                                        console.error(`[Sniper 3M] Telegram attempt ${attempt} failed:`, err.message);
                                        await new Promise(r => setTimeout(r, 1000 * attempt));
                                    }
                                }
                                if (sent) alertedCandles.add(alertKey);
                            }
                        }
                    }
                    // Rate limit (TPS 20)
                    await new Promise(r => setTimeout(r, 1000));
                } catch (e) {
                    console.error(`[Sniper 3M] Error monitoring ${stock.name}: ${e.message}`);
                }
            }
            
            console.log(`[Sniper 3M] Cycle complete. Waiting 10s...`); // [TASK-N09] Reduced delay
            await new Promise(r => setTimeout(r, 10000));
        } catch (mainErr) {
            console.error('[Sniper 3M] Main loop error:', mainErr.message);
            await new Promise(r => setTimeout(r, 10000)); // Cool down
        }
    }
    console.log('[Sniper 3M] Engine stopped gracefully.');
    process.exit(0);
}

runSniper();
