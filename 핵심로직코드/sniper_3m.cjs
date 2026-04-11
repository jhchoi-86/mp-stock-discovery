require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { calculateSignals } = require('./analyzer.cjs');
const { calculateTotalScore } = require('./src/utils/scoreEngine.cjs');
const { sendTelegramMessage } = require('./telegramBot.cjs');

// --- [Phase 5] SSOT Integration ---
const prisma = require('../src/utils/prismaClient.cjs');

const DATA_DIR = path.join(__dirname, 'data');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const KIS_TOKEN_FILE = path.join(DATA_DIR, 'kis_token.json');

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();

// Target Stocks: Top 10 by Score from signals.json
let targetStocks = [];
const alertedCandles = new Set(); 

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

/**
 * 전일 동기화 후 종합 점수 높은 순으로 Top10 종목 식별 (signals.json 기반)
 */
function identifyTargetStocks() {
    if (!fs.existsSync(SIGNALS_FILE) || !fs.existsSync(STOCK_MASTER_FILE)) {
        console.error('[Sniper 3M] Essential data files missing.');
        return [];
    }
    
    try {
        const allSignals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));
        
        // 1. 최신 시점의 데이터만 필터링 (최신 타임스탬프 기준 24시간 내)
        const latestTs = Math.max(...allSignals.map(s => s.timestamp || 0));
        const recentGap = 24 * 60 * 60 * 1000;
        const recentSignals = allSignals.filter(s => s.timestamp >= (latestTs - recentGap));

        // 2. 종목별 타임프레임 신호 그룹화 및 점수 계산
        const scored = stocks.map(stock => {
            const stockSigs = recentSignals.filter(s => s.code === stock.code);
            if (stockSigs.length === 0) return null;

            const tfSigs = {};
            const timeframes = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "2D", "1W"];
            timeframes.forEach(tf => {
                tfSigs[tf] = stockSigs.filter(s => s.timeframe === tf).sort((a,b) => b.timestamp - a.timestamp)[0];
            });

            const latest = stockSigs.sort((a,b) => b.timestamp - a.timestamp)[0];
            const { score } = calculateTotalScore(tfSigs, latest);
            
            return { code: stock.code, name: stock.name, score };
        }).filter(s => s !== null);

        // 3. 점수 내림차순 정렬 후 상위 10개 반환
        return scored.sort((a, b) => b.score - a.score).slice(0, 10);
    } catch (e) {
        console.error('[Sniper 3M] Target identification failed:', e.message);
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
    return {
        open: reversed.map(d => parseInt(d.stck_oprc)),
        high: reversed.map(d => parseInt(d.stck_hgpr)),
        low: reversed.map(d => parseInt(d.stck_lwpr)),
        close: reversed.map(d => parseInt(d.stck_prpr)),
        volume: reversed.map(d => parseInt(d.cntg_vol)),
        time: reversed.map(d => {
            // [TASK-N04] Handle date per record if available, fallback to baseDate
            const dateStr = d.stck_bsop_date || res.data.output1.stck_bsop_date; 
            const h = d.stck_cntg_hour.substring(0, 2);
            const m = d.stck_cntg_hour.substring(2, 4);
            const s = d.stck_cntg_hour.substring(4, 6);
            return Math.floor(new Date(`${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}T${h}:${m}:${s}Z`).getTime() / 1000);
        })
    };
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
    let token;
    try { token = await getKisAccessToken(); } catch(e) { console.error("KIS Token missing"); return; }
    
    targetStocks = identifyTargetStocks();
    console.log(`[Sniper 3M] Target Stocks: ${targetStocks.map(s => s.name).join(', ')}`);

    while (running) {
        try {
            // Market check (09:00 - 15:40 KST)
            const now = new Date();
            const kstHeader = new Date(now.getTime() + (9 * 60 * 60 * 1000));
            const hour = kstHeader.getUTCHours();
            const min = kstHeader.getUTCMinutes();
            
            // [TASK-N06] Daily Reset for alertedCandles
            const today = now.toISOString().split('T')[0];
            if (today !== lastResetDate) {
                console.log(`[Sniper 3M] Daily reset of alertedCandles Cache (${lastResetDate} -> ${today})`);
                alertedCandles.clear();
                lastResetDate = today;
            }

            const isMarketOpen = (hour > 9 || (hour === 9 && min >= 0)) && (hour < 20 || (hour === 20 && min <= 0));
            
            if (!isMarketOpen) {
                console.log(`[Sniper 3M] Market Closed (${hour}:${min}). Waiting...`);
                await new Promise(r => setTimeout(r, 60000));
                continue;
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
                                console.log(`[Sniper 3M] ALERT! ${stock.name} (${stock.code}) Absolute Signal at ${signal.current_price}`);
                                const msg = `🎯 [스나이퍼-3M 절대신호]\n종목: ${stock.name}\n현재가: ${signal.current_price.toLocaleString()}원\n전략: 전일 추천주 실시간 돌파 포착`;
                                
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
