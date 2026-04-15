require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// --- Service Integrations ---
const ScoringService = require('./src/services/ScoringService.cjs');
const signalReportService = require('./src/services/signalReportService.cjs');
const BulkSyncService = require('./src/services/BulkSyncService.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const redis = require('./platform/infra/redis/client.cjs');
const { getKstNow } = require('./src/utils/kst.cjs');

// --- Paths & Config ---
const DATA_DIR = path.join(__dirname, 'data');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const KIS_TOKEN_FILE = path.join(DATA_DIR, 'kis_token.json');

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();

let kisAccessToken = null;
let kisTokenExpiry = 0;

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Robust KIS Token Management with atomic writing
 */
async function getKisAccessToken(force = false) {
    if (!KIS_APP_KEY || !KIS_APP_SECRET) throw new Error("KIS API Keys missing");
    
    if (!force && !kisAccessToken && fs.existsSync(KIS_TOKEN_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(KIS_TOKEN_FILE, 'utf8'));
            kisAccessToken = saved.token;
            kisTokenExpiry = saved.expiry;
        } catch (e) {}
    }
    
    if (!force && kisAccessToken && kisTokenExpiry > Date.now() + 3600000) return kisAccessToken;
    
    console.log(`[KIS API] ${force ? 'FORCING' : 'Requesting'} new Access Token...`);
    const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        grant_type: 'client_credentials', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET
    });
    kisAccessToken = response.data.access_token;
    kisTokenExpiry = Date.now() + (response.data.expires_in * 1000);
    
    // Atomic Write
    const tokenData = JSON.stringify({ token: kisAccessToken, expiry: kisTokenExpiry });
    const tempPath = KIS_TOKEN_FILE + '.tmp';
    fs.writeFileSync(tempPath, tokenData, 'utf8');
    if (fs.existsSync(KIS_TOKEN_FILE)) fs.unlinkSync(KIS_TOKEN_FILE);
    fs.renameSync(tempPath, KIS_TOKEN_FILE);
    
    return kisAccessToken;
}

// --- Chart Utilities ---
const resampleChartData = (raw, factor, tf) => {
    let resampled = { open: [], high: [], low: [], close: [], volume: [], time: [] };
    if (!raw.time || raw.time.length < factor) return raw;

    for (let i = 0; i < raw.time.length; i += factor) {
        const end = Math.min(i + factor, raw.time.length);
        const chunk = {
            open: raw.open[i],
            high: Math.max(...raw.high.slice(i, end)),
            low: Math.min(...raw.low.slice(i, end)),
            close: raw.close[end - 1],
            volume: raw.volume.slice(i, end).reduce((a, b) => a + (b || 0), 0),
            time: raw.time[i]
        };
        resampled.open.push(chunk.open);
        resampled.high.push(chunk.high);
        resampled.low.push(chunk.low);
        resampled.close.push(chunk.close);
        resampled.volume.push(chunk.volume);
        resampled.time.push(chunk.time);
    }
    if (raw.kis_change_data) resampled.kis_change_data = raw.kis_change_data;
    return resampled;
};

/**
 * Robust Hybrid History Fetcher with Overtime Price Support
 */
async function fetchHybridHistory(stock, days, interval, kisTokenGlobal, kisCache = null) {
    const suffix = stock.market.includes('KOSPI') ? '.KS' : '.KQ';
    const symbolKS = stock.code + suffix;
    const period1 = Math.floor(Date.now() / 1000) - (86400 * days);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolKS}?period1=${period1}&period2=${period2}&interval=${interval}`;
    
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`Yahoo Fetch Failed: ${response.status}`);
    const data = await response.json();
    const result = data.chart.result[0];
    const quotes = result.indicators.quote[0];
    const timestamps = result.timestamp;
    
    let validIndices = [];
    for (let i = 0; i < quotes.close.length; i++) {
        if (quotes.close[i] !== null && timestamps[i] !== null) validIndices.push(i);
    }

    let chartData = {
        open: validIndices.map(i => quotes.open[i]),
        high: validIndices.map(i => quotes.high[i]),
        low: validIndices.map(i => quotes.low[i]),
        close: validIndices.map(i => quotes.close[i]),
        volume: validIndices.map(i => quotes.volume[i]),
        time: validIndices.map(i => timestamps[i])
    };

    if (kisTokenGlobal) {
        let kisData = null;
        let foreignBuy = 0, instBuy = 0;

        if (kisCache && kisCache[stock.code]) {
            kisData = kisCache[stock.code].price;
            foreignBuy = kisCache[stock.code].foreign_buy || 0;
            instBuy = kisCache[stock.code].inst_buy || 0;
        } else {
            try {
                const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
                const kisRes = await axios.get(kisUrl, {
                    headers: { 'authorization': 'Bearer ' + kisTokenGlobal, 'appkey': KIS_APP_KEY, 'appsecret': KIS_APP_SECRET, 'tr_id': 'FHKST01010100' },
                    params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock.code },
                    timeout: 5000
                });
                kisData = kisRes.data.output;
                
                // [Red Team Fix] [v9.4.6] Staggered delay to prevent KIS Rate Limit (20/sec)
                await sleep(300);

                // [Red Team Fix] [v9.4.12] Hardened Investor Data Fetch with Retail & Logging
                let investorFetchSuccess = false;
                for (let retry = 0; retry < 2; retry++) {
                    try {
                        const trendRes = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor', {
                            headers: { 'authorization': 'Bearer ' + kisTokenGlobal, 'appkey': KIS_APP_KEY, 'appsecret': KIS_APP_SECRET, 'tr_id': 'FHKST01010900' },
                            params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock.code },
                            timeout: 5000 // Increased to 5s
                        });
                        if (trendRes.data.output) {
                            const out = Array.isArray(trendRes.data.output) ? trendRes.data.output[0] : trendRes.data.output;
                            foreignBuy = parseInt(out.frgn_ntby_qty) || 0;
                            instBuy = parseInt(out.orgn_ntby_qty) || 0;
                            investorFetchSuccess = true;
                            break; 
                        }
                    } catch (trendErr) {
                        const isRateLimit = trendErr.response && trendErr.response.data && trendErr.response.data.msg_cd === 'EGW00201';
                        console.warn(`[KIS API] Investor Fetch Alert for ${stock.code}: ${trendErr.message} (Retry: ${retry + 1})`);
                        if (isRateLimit) await sleep(1000); // Backoff if rate limited
                        else await sleep(300);
                    }
                }
                if (!investorFetchSuccess) {
                    console.error(`[KIS API] CRITICAL: Final failure fetching investor data for ${stock.code}`);
                }

                if (kisCache) kisCache[stock.code] = { price: kisData, foreign_buy: foreignBuy, inst_buy: instBuy };
            } catch(e) {
                if (e.response && e.response.data && e.response.data.msg_cd === 'EGW00123') throw { type: 'TOKEN_EXPIRED', originalError: e };
                throw new Error(`[KIS API] Required Price Fetch Failed for ${stock.code}: ${e.message}`);
            }
        }

        if (kisData && kisData.stck_prpr) {
            let currentPrice = parseInt(kisData.stck_prpr);
            const currentHigh = parseInt(kisData.stck_hgpr);
            const currentLow = parseInt(kisData.stck_lwpr);
            
            // [LEGACY MERGE] Overtime Price Support (16:00 - 20:00)
            const kstNow = getKstNow();
            const kstHour = kstNow.getUTCHours(); // KST is UTC+9, but getKstNow returns adjusted object
            const overtimePrice = parseInt(kisData.ovtm_untp_prpr || 0);
            if (kstHour >= 16 && kstHour <= 20 && overtimePrice > 0) {
                currentPrice = overtimePrice;
            }

            chartData.kis_change_data = {
                sign: kisData.prdy_vrss_sign,
                change: parseInt(kisData.prdy_vrss),
                rate: parseFloat(kisData.prdy_ctrt),
                trade_amount: parseInt(kisData.acml_tr_pbmn),
                foreign_buy: foreignBuy,
                inst_buy: instBuy,
                stck_prpr: currentPrice
            };

            const lastIdx = chartData.close.length - 1;
            if (lastIdx >= 0) {
                const lastDate = new Date(chartData.time[lastIdx] * 1000);
                const isSameDay = (lastDate.getUTCDate() === kstNow.getUTCDate() && lastDate.getUTCMonth() === kstNow.getUTCMonth());
                
                if (isSameDay) {
                    chartData.close[lastIdx] = currentPrice;
                    chartData.high[lastIdx] = Math.max(chartData.high[lastIdx], currentHigh);
                    chartData.low[lastIdx] = Math.min(chartData.low[lastIdx], currentLow);
                } else {
                    chartData.open.push(currentPrice); chartData.high.push(currentHigh);
                    chartData.low.push(currentLow); chartData.close.push(currentPrice);
                    chartData.volume.push(0); chartData.time.push(Math.floor(Date.now() / 1000));
                }
            }
        }
    }
    return chartData;
}

// --- Math Helpers (Unified from UTF8 version) ---
function rsi(src, period) {
    if (src.length <= period) return Array(src.length).fill(null);
    let rsiValues = Array(period).fill(null);
    let gains = [], losses = [];
    for (let i = 1; i < src.length; i++) {
        let diff = src[i] - src[i-1];
        gains.push(Math.max(0, diff)); losses.push(Math.max(0, -diff));
    }
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
    rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }
    return rsiValues;
}
function ema(src, period) {
    const k = 2 / (period + 1);
    let emaValues = [src[0]];
    for (let i = 1; i < src.length; i++) emaValues.push(src[i] * k + emaValues[i-1] * (1 - k));
    return emaValues;
}
function sma(src, period) {
    let res = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) res.push(null);
        else { let sum = 0; for (let j = 0; j < period; j++) sum += src[i - j]; res.push(sum / period); }
    }
    return res;
}
function lowest(src, period) {
    let res = [];
    for (let i = 0; i < src.length; i++) res.push(i < period - 1 ? null : Math.min(...src.slice(i - period + 1, i + 1)));
    return res;
}
function highest(src, period) {
    let res = [];
    for (let i = 0; i < src.length; i++) res.push(i < period - 1 ? null : Math.max(...src.slice(i - period + 1, i + 1)));
    return res;
}
function stdev(src, period) {
    let res = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) { res.push(null); continue; }
        let win = src.slice(i - period + 1, i + 1);
        let mean = win.reduce((a, b) => a + b) / period;
        let variance = win.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
        res.push(Math.sqrt(variance));
    }
    return res;
}
function calculateADX(high, low, close, period = 14) {
    if (close.length <= period) return Array(close.length).fill(null);
    let tr = [0], pDM = [0], mDM = [0];
    for (let i = 1; i < close.length; i++) {
        let uM = high[i] - high[i-1], dM = low[i-1] - low[i];
        pDM.push((uM > dM && uM > 0) ? uM : 0); mDM.push((dM > uM && dM > 0) ? dM : 0);
        tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i-1]), Math.abs(low[i] - close[i-1])));
    }
    let sTR = Array(period).fill(null), sPDM = Array(period).fill(null), sMDM = Array(period).fill(null);
    sTR[period] = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
    sPDM[period] = pDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
    sMDM[period] = mDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
    for (let i = period + 1; i < close.length; i++) {
        sTR[i] = sTR[i-1] - (sTR[i-1]/period) + tr[i];
        sPDM[i] = sPDM[i-1] - (sPDM[i-1]/period) + pDM[i];
        sMDM[i] = sMDM[i-1] - (sMDM[i-1]/period) + mDM[i];
    }
    let adx = Array(close.length).fill(null), dx = [];
    for (let i = period; i < close.length; i++) {
        let pDI = 100 * (sPDM[i] / sTR[i]), mDI = 100 * (sMDM[i] / sTR[i]);
        dx.push(pDI + mDI === 0 ? 0 : 100 * Math.abs(pDI - mDI) / (pDI + mDI));
    }
    for (let i = period * 2 - 1; i < close.length; i++) {
        if (i === period * 2 - 1) adx[i] = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
        else adx[i] = ((adx[i-1] * (period - 1)) + dx[i - period]) / period;
    }
    return adx;
}


// --- Main Indicator Engine (Full UTF8 Logic) ---
function calculateSignals(ohlcHistory, timeframeStr = '1D') {
    const { close, open, high, low, volume, time: timeArr } = ohlcHistory;
    if (close.length < 50) return null;
    const len = close.length, last_idx = len - 1;

    // RSI Pivots & Price Targets
    const rsi14 = rsi(close, 14), P_1 = rsi14.map((v, i) => i > 1 && rsi14[i-2] < rsi14[i-1] && rsi14[i-1] > rsi14[i]), hi3 = highest(high, 3), hi14 = highest(high, 14);
    let result_1 = 0, lB1 = null, pB1 = null, Q1 = null, QQ1 = null;
    for (let i = 0; i < len; i++) { if (P_1[i]) { pB1 = lB1; lB1 = hi3[i]; if (pB1 && lB1 < pB1) { QQ1 = Q1; Q1 = hi14[i]; } } if (Q1 && QQ1) result_1 = Q1 < QQ1 ? Q1 : QQ1; }

    const rsi3 = rsi(close, 3), P_2 = rsi3.map((v, i) => i > 1 && rsi3[i-2] > rsi3[i-1] && rsi3[i-1] < rsi3[i]), lo3 = lowest(low, 3);
    let result_2 = 0, lB2 = null, pB2 = null, Q2 = null, QQ2 = null;
    const lo_rsi_2 = lowest(low, 3);
    for (let i = 0; i < len; i++) { if (P_2[i]) { pB2 = lB2; lB2 = lo3[i]; if (pB2 && lB2 > pB2) { QQ2 = Q2; Q2 = lo_rsi_2[i]; } } if (Q2 && QQ2) result_2 = Q2 > QQ2 ? Q2 : QQ2; }

    // MACD Trend Filter
    const mR = ema(close, 8), mL = ema(close, 26), BBMacd = mR.map((r, i) => r - mL[i]), Avg = ema(BBMacd, 9), SDev = stdev(BBMacd, 9), bSup = Avg.map((a, i) => a + 0.2 * SDev[i]);
    const cond_up7 = BBMacd[last_idx] > bSup[last_idx];

    // DHH2 Logic (Pullback Breakout)
    const pullback = Array(len).fill(false);
    for (let i = 1; i < len; i++) pullback[i] = (result_2 > 0) && (open[i] > result_2);
    let DHH2 = false;
    for (let i = last_idx; i > Math.max(0, last_idx - 5); i--) if (pullback[i] && cond_up7) DHH2 = true;

    // Concurrency & Progress
    const tfMsMap = { '5M': 300000, '15M': 900000, '30M': 1800000, '1H': 3600000, '2H': 7200000, '4H': 14400000, '1D': 86400000, '2D': 172800000, '1W': 604800000 };
    const tfMs = tfMsMap[timeframeStr] || 86400000;
    const candleStartRaw = timeArr[last_idx];
    const candleStart = candleStartRaw > 1e11 ? candleStartRaw : candleStartRaw * 1000;
    const progress = Math.min(1.0, (Date.now() - candleStart) / tfMs);
    const signal_HH = DHH2 && progress > 0.3;

    const adx = calculateADX(high, low, close, 14)[last_idx] || 0;
    const currentPrice = close[last_idx];
    const avgVol20 = (sma(volume, 20)[last_idx] || 0);
    const volRate = avgVol20 > 0 ? volume[last_idx] / avgVol20 : 1;

    // Moving Averages
    const sma5Arr = sma(close, 5), sma10Arr = sma(close, 10), sma20Arr = sma(close, 20), sma60Arr = sma(close, 60);
    const s5 = sma5Arr[last_idx], s10 = sma10Arr[last_idx], s20 = sma20Arr[last_idx], s60 = sma60Arr[last_idx];

    // BBW Logic
    const calculateBBW = (src) => {
        const bS = sma(src, 25), bD = stdev(src, 25);
        const series = bS.map((s, i) => (s && bD[i]) ? (4 * bD[i] / s) * 100 * 50 + 100 : 0);
        return series[series.length - 1] || 0;
    };
    const bbw = calculateBBW(close);

    // Advanced Signal Grading (Red Team Requirement)
    const signal_H = signal_HH || (rsi(close, 2)[last_idx] < 15 && bbw > 150);
    const signal_HHH = signal_HH && progress > 0.8 && volRate > 2.0;

    // [v9.4.3] Multi-Tier Price Hierarchy Hardening
    // Hierarchy: TargetPrice > CurrentPrice > Entry1 > Entry2 > StopLoss
    const final_target = Math.max(Math.round(result_1 || 0), Math.round(currentPrice * 1.05));
    const final_entry1 = Math.min(Math.round(result_2 || currentPrice), Math.round(currentPrice * 0.98));
    const final_entry2 = Math.round(final_entry1 * 0.97);
    const final_stop = Math.round(final_entry2 * 0.98);

    return {
        id: uuidv4(),
        code: '', name: '', timeframe: timeframeStr, timestamp: Date.now(),
        current_price: currentPrice, 
        result_1: final_target, 
        result_2: final_entry1, 
        result_3: final_entry2,
        stop_loss: final_stop,
        cond_up7, DHH2, progress: Number(progress.toFixed(3)), signal_HH, signal_H, signal_HHH, adx, bbw,
        sma5: Math.round(s5), sma10: Math.round(s10), sma20: Math.round(s20), sma60: Math.round(s60),
        maArrangement: (s5 > s20) ? '정배열' : '역배열',
        entry_approved: true, trigger_vol: (volRate > 1.5),
        target_price: final_target, // Unified field name
        target_price_1: final_target, // Legacy support
        score: { total: 0, breakdown: [] } 
    };
}

// [v9.3.4] UTF-8 강제 설정
process.env.LANG = 'ko_KR.UTF-8';

// --- (Previous helper functions remain same) ---

// [NEW] pLimit Helper (Manual implementation to satisfy Work Order without new dependency)
function pLimit(concurrency) {
    const queue = [];
    let activeCount = 0;
    const next = () => {
        activeCount--;
        if (queue.length > 0) queue.shift()();
    };
    return (fn) => new Promise((resolve, reject) => {
        const run = async () => {
            activeCount++;
            try { resolve(await fn()); } 
            catch (err) { reject(err); } 
            finally { next(); }
        };
        if (activeCount < concurrency) run();
        else queue.push(run);
    });
}

// --- CLI Runner with p-limit & Bulk Sync ---
if (require.main === module) {
    (async function runUnifiedSync() {
        const timeframes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['1D'];
        const SYNC_BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE) || 3;
        const limit = pLimit(SYNC_BATCH_SIZE);
        
        console.log(`[Unified Engine] Starting sync (Limit: ${SYNC_BATCH_SIZE})...`);
        let stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));
        if (process.env.STOCK_FILTER) {
            const filterCodes = process.env.STOCK_FILTER.split(',').map(s => s.trim());
            stocks = stocks.filter(s => filterCodes.includes(s.ticker || s.code));
            console.log(`[Unified Engine] Filtering stocks: ${filterCodes.join(', ')}`);
        }
        const kisToken = await getKisAccessToken();
        const allSignals = [];

        for (const tf of timeframes) {
            console.log(`[Unified Engine] Syncing TF: ${tf}`);
            
            const tasks = stocks.map(stock => limit(async () => {
                let retries = 5;
                while (retries > 0) {
                    try {
                        const days = { '1D': 365, '1W': 730, '2D': 365, '4H': 90, '2H': 60, '1H': 60, '30M': 30, '5M': 5 }[tf] || 90;
                        const interval = { '1D': '1d', '1W': '1wk', '2D': '1d', '4H': '1h', '2H': '1h', '1H': '1h', '30M': '30m', '5M': '5m' }[tf] || '1d';
                        const history = await fetchHybridHistory(stock, days, interval, kisToken);
                        let finalHistory = history;
                        if (tf === '2H') finalHistory = resampleChartData(history, 2, '2H');
                        if (tf === '4H') finalHistory = resampleChartData(history, 4, '4H');
                        if (tf === '2D') finalHistory = resampleChartData(history, 2, '2D');
                        const signal = calculateSignals(finalHistory, tf);
                        if (signal) {
                            return { ...signal, code: stock.code, name: stock.name };
                        }
                        return null;
                    } catch (err) {
                        console.error(`[Retry ${6-retries}] ${stock.code}: ${err.message}`);
                        retries--;
                        if (retries > 0) await sleep(Math.pow(2, 5-retries) * 200);
                    }
                }
                return null;
            }));

            const results = await Promise.all(tasks);
            const valid = results.filter(r => r !== null);
            allSignals.push(...valid);
            
            // [v9.3.4] GC Hint after each timeframe batch
            if (global.gc) {
                console.log(`[GC] Triggering garbage collection...`);
                global.gc();
            }
        }

        // Save to signals.json (Atomic)
        const currentSigs = fs.existsSync(SIGNALS_FILE) ? JSON.parse(fs.readFileSync(SIGNALS_FILE)) : [];
        const merged = [...currentSigs.filter(s => !timeframes.includes(s.timeframe)), ...allSignals].slice(-5000);
        fs.writeFileSync(SIGNALS_FILE + '.tmp', JSON.stringify(merged, null, 2));
        if (fs.existsSync(SIGNALS_FILE)) fs.unlinkSync(SIGNALS_FILE);
        fs.renameSync(SIGNALS_FILE + '.tmp', SIGNALS_FILE);

        // Bulk Sync to DB
        if (allSignals.length > 0) {
            const dbRes = await BulkSyncService.bulkUpsertSnapshots(allSignals);
            console.log(`[Unified Engine] DB Sync Result: ${dbRes.success ? 'Success' : 'Failed'}`);
        }

        console.log(`[Unified Engine] Full Sync Complete.`);
        process.exit(0);
    })();
}

module.exports = { calculateSignals, fetchHybridHistory, getKisAccessToken, resampleChartData };
