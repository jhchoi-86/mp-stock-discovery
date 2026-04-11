require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// --- KIS Config & Token Logic (Top-level for module access) ---
const DATA_DIR = path.join(__dirname, 'data');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const KIS_TOKEN_FILE = path.join(DATA_DIR, 'kis_token.json');

// --- [Phase 4] SSOT DB Integration ---
const ScoringService = require('./src/services/ScoringService.cjs');
const signalReportService = require('./src/services/signalReportService.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const redis = require('./platform/infra/redis/client.cjs');

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();

let kisAccessToken = null;
let kisTokenExpiry = 0;

async function getKisAccessToken(force = false) {
    if (!KIS_APP_KEY || !KIS_APP_SECRET) throw new Error("KIS API Keys missing");
    
    // Default: Return cached token if valid for > 1 hour
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
    fs.writeFileSync(KIS_TOKEN_FILE, JSON.stringify({ token: kisAccessToken, expiry: kisTokenExpiry }));
    return kisAccessToken;
}

// --- Chart Resampling Utility ---
const resampleChartData = (raw, hourCount, tf) => {
    let resampled = { open: [], high: [], low: [], close: [], volume: [], time: [] };
    if (!raw.time || raw.time.length === 0) return resampled;
    const isDayBased = (tf === '2D' || tf === '3D' || tf === '1W');
    
    let currentCandle = null;
    let candleCount = 0;
    let currentDayStr = null;
    let firstDayInGroup = null;

    for (let i = 0; i < raw.time.length; i++) {
        const date = new Date(raw.time[i] * 1000);
        date.setUTCHours(date.getUTCHours() + 9);
        const dayStr = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;

        // 날짜 변경 시 처리
        if (currentDayStr !== dayStr && currentCandle) {
            if (!isDayBased) {
                // 분봉 기반 리샘플링은 날짜 변경 시 무조건 flush
                resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
                resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
                resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
                currentCandle = null; candleCount = 0;
            } else if (tf === '2D' && candleCount >= hourCount) {
                // 2D 리샘플링: 이미 2일치를 채웠으면 flush
                resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
                resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
                resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
                currentCandle = null; candleCount = 0;
            }
        }

        if (currentCandle === null) {
            currentDayStr = dayStr;
            currentCandle = { open: raw.open[i], high: raw.high[i], low: raw.low[i], close: raw.close[i], volume: raw.volume[i], time: raw.time[i] };
            candleCount = 1;
        } else {
            currentCandle.high = Math.max(currentCandle.high, raw.high[i]);
            currentCandle.low = Math.min(currentCandle.low, raw.low[i]);
            currentCandle.close = raw.close[i]; currentCandle.volume += raw.volume[i];
            if (currentDayStr !== dayStr) {
                candleCount++;
                currentDayStr = dayStr;
            }
        }

        if (!isDayBased && candleCount === hourCount) {
            resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
            resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
            resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
            currentCandle = null; candleCount = 0;
        }
    }
    if (currentCandle) {
        resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
        resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
        resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
    }
    if (raw.kis_change_data) resampled.kis_change_data = raw.kis_change_data;
    return resampled;
};

// --- Hybrid History Fetcher ---
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
        let foreignBuy = 0;
        let instBuy = 0;

        if (kisCache && kisCache[stock.code]) {
            kisData = kisCache[stock.code].price;
            foreignBuy = kisCache[stock.code].foreign_buy;
            instBuy = kisCache[stock.code].inst_buy;
        } else {
            try {
                const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
                const kisRes = await axios.get(kisUrl, {
                    headers: { 'authorization': 'Bearer ' + kisTokenGlobal, 'appkey': KIS_APP_KEY, 'appsecret': KIS_APP_SECRET, 'tr_id': 'FHKST01010100' },
                    params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock.code },
                    timeout: 5000
                });
                kisData = kisRes.data.output;
                
                try {
                    const trendRes = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor', {
                        headers: { 
                            'authorization': 'Bearer ' + kisTokenGlobal, 
                            'appkey': KIS_APP_KEY, 
                            'appsecret': KIS_APP_SECRET, 
                            'tr_id': 'FHKST01010900' 
                        },
                        params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock.code },
                        timeout: 3000
                    });
                    if (trendRes.data.output) {
                        foreignBuy = parseInt(trendRes.data.output.frgn_ntby_qty) || 0;
                        instBuy = parseInt(trendRes.data.output.orgn_ntby_qty) || 0;
                    }
                } catch (trendErr) {
                    console.warn(`[KIS Trend] Failed for ${stock.code}: ${trendErr.message}`);
                }

                if (kisCache) {
                    kisCache[stock.code] = { price: kisData, foreign_buy: foreignBuy, inst_buy: instBuy };
                }
            } catch(e) {
                if (e.response && e.response.data && e.response.data.msg_cd === 'EGW00123') {
                    throw { type: 'TOKEN_EXPIRED', originalError: e };
                }
            }
        }

        if (kisData && kisData.stck_prpr) {
            const currentPrice = parseInt(kisData.stck_prpr);
            const currentHigh = parseInt(kisData.stck_hgpr);
            const currentLow = parseInt(kisData.stck_lwpr);
            
            chartData.kis_change_data = {
                sign: kisData.prdy_vrss_sign,
                change: parseInt(kisData.prdy_vrss),
                rate: parseFloat(kisData.prdy_ctrt),
                trade_amount: parseInt(kisData.acml_tr_pbmn),
                foreign_buy: foreignBuy,
                inst_buy: instBuy
            };

            const lastIdx = chartData.close.length - 1;
            if (lastIdx >= 0) {
                chartData.close[lastIdx] = currentPrice;
                chartData.high[lastIdx] = Math.max(chartData.high[lastIdx], currentHigh);
                chartData.low[lastIdx] = Math.min(chartData.low[lastIdx], currentLow);
            }
        }
    }
    return chartData;
};

// --- Math Utilities ---

function rsi(src, period) {
    if (src.length <= period) return Array(src.length).fill(null);
    let rsiValues = Array(period).fill(null);
    
    let gains = [];
    let losses = [];
    
    for (let i = 1; i < src.length; i++) {
        let diff = src[i] - src[i-1];
        gains.push(Math.max(0, diff));
        losses.push(Math.max(0, -diff));
    }
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
    
    const firstRS = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    rsiValues.push(firstRS);
    
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        const rs = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        rsiValues.push(rs);
    }
    
    return rsiValues;
}

function ema(src, period) {
    const k = 2 / (period + 1);
    let emaValues = [src[0]];
    for (let i = 1; i < src.length; i++) {
        emaValues.push(src[i] * k + emaValues[i-1] * (1 - k));
    }
    return emaValues;
}

function sma(src, period) {
    let results = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) {
            results.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += src[i - j];
            }
            results.push(sum / period);
        }
    }
    return results;
}

function lowest(source, period) {
    let result = [];
    for (let i = 0; i < source.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            let win = source.slice(i - period + 1, i + 1);
            result.push(Math.min(...win));
        }
    }
    return result;
}

function highest(source, period) {
    let result = [];
    for (let i = 0; i < source.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            let win = source.slice(i - period + 1, i + 1);
            result.push(Math.max(...win));
        }
    }
    return result;
}

function stdev(src, period) {
    let results = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) {
            results.push(null);
            continue;
        }
        let window = src.slice(i - period + 1, i + 1);
        let mean = window.reduce((a, b) => a + b) / period;
        let variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
        results.push(Math.sqrt(variance));
    }
    return results;
}

// ADX (Average Directional Index) Calculation
function calculateADX(high, low, close, period = 14) {
    if (close.length <= period) return Array(close.length).fill(null);
    let tr = [0], plusDM = [0], minusDM = [0];

    for (let i = 1; i < close.length; i++) {
        let upMove = high[i] - high[i - 1];
        let downMove = low[i - 1] - low[i];
        
        plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
        minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
        
        let tr1 = high[i] - low[i];
        let tr2 = Math.abs(high[i] - close[i - 1]);
        let tr3 = Math.abs(low[i] - close[i - 1]);
        tr.push(Math.max(tr1, tr2, tr3));
    }

    let smoothTR = [0], smoothPlusDM = [0], smoothMinusDM = [0];
    
    // Wilder's Smoothing
    for (let i = 1; i < close.length; i++) {
        if (i < period) {
            smoothTR.push(null);
            smoothPlusDM.push(null);
            smoothMinusDM.push(null);
            continue;
        }
        if (i === period) {
            smoothTR.push(tr.slice(1, period + 1).reduce((a, b) => a + b, 0));
            smoothPlusDM.push(plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0));
            smoothMinusDM.push(minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0));
        } else {
            smoothTR.push(smoothTR[i - 1] - (smoothTR[i - 1] / period) + tr[i]);
            smoothPlusDM.push(smoothPlusDM[i - 1] - (smoothPlusDM[i - 1] / period) + plusDM[i]);
            smoothMinusDM.push(smoothMinusDM[i - 1] - (smoothMinusDM[i - 1] / period) + minusDM[i]);
        }
    }

    let adx = Array(close.length).fill(null);
    let dx = [];

    for (let i = period; i < close.length; i++) {
        let plusDI = 100 * (smoothPlusDM[i] / smoothTR[i]);
        let minusDI = 100 * (smoothMinusDM[i] / smoothTR[i]);
        if (plusDI + minusDI === 0) {
            dx.push(0);
        } else {
            dx.push(100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI));
        }
    }

    let dxOffset = period; // dx array is shorter than close array
    for (let i = period * 2 - 1; i < close.length; i++) {
        if (i === period * 2 - 1) {
            adx[i] = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
        } else {
            adx[i] = ((adx[i - 1] * (period - 1)) + dx[i - dxOffset]) / period;
        }
    }

    return adx;
}

/**
 * Re-implements ta.valuewhen
 * @param {Array<boolean>} condition 
 * @param {Array<number>} source 
 * @param {number} occurrence (0 = latest, 1 = previous...)
 */
function valuewhen(condition, source, occurrence = 0) {
    let matches = [];
    for (let i = 0; i < condition.length; i++) {
        if (condition[i]) {
            matches.push({ val: source[i], idx: i });
        }
    }
    if (matches.length <= occurrence) return null;
    return matches[matches.length - 1 - occurrence].val;
}

// --- Pine Indicator Implementation ---

function calculateSignals(ohlcHistory, timeframeStr = '1D') {
    // Filter out potential nulls from Yahoo Finance
    const timestamps = ohlcHistory.time || [];
    const rawClose = ohlcHistory.close || [];
    const rawOpen = ohlcHistory.open || [];
    const rawHigh = ohlcHistory.high || [];
    const rawLow = ohlcHistory.low || [];
    const rawVolume = ohlcHistory.volume || [];

    let cleanData = [];
    for (let i = 0; i < rawClose.length; i++) {
        if (rawClose[i] !== null && rawOpen[i] !== null && rawHigh[i] !== null && rawLow[i] !== null) {
            cleanData.push({
                close: rawClose[i],
                open: rawOpen[i],
                high: rawHigh[i],
                low: rawLow[i],
                volume: rawVolume[i] || 0,
                time: timestamps[i]
            });
        }
    }

    if (cleanData.length < 50) return null;

    const close = cleanData.map(d => d.close);
    const open = cleanData.map(d => d.open);
    const low = cleanData.map(d => d.low);
    const high = cleanData.map(d => d.high);
    const volume = cleanData.map(d => d.volume);
    const timeArr = cleanData.map(d => d.time); // Unix timestamp in seconds
    const len = close.length;

    // RSI Pivot 1 (RSI 14 - User Pine Script Base for Resistance/Pivot High)
    const rsiPeriod_1 = 14;
    const rsi14 = rsi(close, rsiPeriod_1);
    const P_1 = rsi14.map((val, i) => i > 1 ? (rsi14[i-2] < rsi14[i-1] && rsi14[i-1] > rsi14[i]) : false);
    const highest_high_3_1 = highest(high, 3);
    const highest_high_rsi_1 = highest(high, rsiPeriod_1);
    
    let result_1_series = Array(len).fill(0);
    let last_val_B1 = null;
    let prev_val_B1 = null;
    let Q_1 = null;
    let QQ_1 = null;
    
    for (let i = 0; i < len; i++) {
        if (P_1[i]) {
            prev_val_B1 = last_val_B1;
            last_val_B1 = highest_high_3_1[i];
            if (prev_val_B1 !== null && last_val_B1 < prev_val_B1) { // Lower High for resistance tracking
                QQ_1 = Q_1;
                Q_1 = highest_high_rsi_1[i];
            }
        }
        if (Q_1 !== null && QQ_1 !== null) {
            result_1_series[i] = Q_1 < QQ_1 ? Q_1 : QQ_1; 
        } else if (i > 0) {
            result_1_series[i] = result_1_series[i-1];
        }
    }

    // RSI Pivot 2 (RSI 3)
    const rsiPeriod_2 = 3;
    const rsi3 = rsi(close, rsiPeriod_2);
    const P_2 = rsi3.map((val, i) => i > 1 ? (rsi3[i-2] > rsi3[i-1] && rsi3[i-1] < rsi3[i]) : false);
    const lowest_low_3_2 = lowest(low, 3);
    const lowest_low_rsi_2 = lowest(low, rsiPeriod_2); 
    
    // Calculate result_2 over time (O(N) Optimization)
    let result_2_series = Array(len).fill(0);
    let last_val_B2 = null;
    let prev_val_B2 = null;
    let Q_2 = null;
    let QQ_2 = null;
    
    for (let i = 0; i < len; i++) {
        if (P_2[i]) {
            prev_val_B2 = last_val_B2;
            last_val_B2 = lowest_low_3_2[i];
            
            // Higher Low Trigger (PineScript: B_2[1] < B_2)
            if (prev_val_B2 !== null && last_val_B2 > prev_val_B2) {
                QQ_2 = Q_2;
                Q_2 = lowest_low_rsi_2[i];
            }
        }
        
        if (Q_2 !== null && QQ_2 !== null) {
            result_2_series[i] = Q_2 > QQ_2 ? Q_2 : QQ_2;
        } else if (i > 0) {
            result_2_series[i] = result_2_series[i-1];
        }
    }

    // RSI Pivot 2 (RSI 10 - User Pine Script Base)
    const rsiPeriod_3 = 10;
    const rsi8 = rsi(close, rsiPeriod_3);
    const P_3 = rsi8.map((val, i) => i > 1 ? (rsi8[i-2] > rsi8[i-1] && rsi8[i-1] < rsi8[i]) : false);
    const lowest_low_3_3 = lowest(low, 3);
    const lowest_low_rsi_3 = lowest(low, rsiPeriod_3);
    
    // Calculate result_3 over time (O(N) Optimization)
    let result_3_series = Array(len).fill(0);
    let last_val_B3 = null;
    let prev_val_B3 = null;
    let Q_3 = null;
    let QQ_3 = null;
    
    for (let i = 0; i < len; i++) {
        if (P_3[i]) {
            prev_val_B3 = last_val_B3;
            last_val_B3 = lowest_low_3_3[i];
            
            // Higher Low Trigger (PineScript: B_3[1] < B_3)
            if (prev_val_B3 !== null && last_val_B3 > prev_val_B3) {
                QQ_3 = Q_3;
                Q_3 = lowest_low_rsi_3[i];
            }
        }
        
        if (Q_3 !== null && QQ_3 !== null) {
            result_3_series[i] = Q_3 > QQ_3 ? Q_3 : QQ_3;
        } else if (i > 0) {
            result_3_series[i] = result_3_series[i - 1];
        }
    }

    // --- Trend Filter (EMA MACD) ---
    // [1] Primary Timeframe MACD (8, 26, 9, 0.2)
    const m_rapida = ema(close, 8);
    const m_lenta = ema(close, 26);
    const BBMacd = m_rapida.map((r, i) => r - m_lenta[i]);
    const Avg = ema(BBMacd, 9);
    const SDev = stdev(BBMacd, 9);
    const stdv = 0.2;
    const banda_supe = Avg.map((a, i) => a + stdv * SDev[i]);

    // [2] Multi-Timeframe (MTF) MACD
    const multiplier = 2;
    // Aggregate close array (compress)
    let mtfCloses = [];
    for (let i = 0; i < len; i += multiplier) {
        let endIdx = Math.min(i + multiplier - 1, len - 1);
        mtfCloses.push(close[endIdx]);
    }
    
    // Calculate indicators on compressed array
    const rapida_mtf = 12;
    const lenta_mtf = 39;
    const stdv_mtf = 0.4;
    
    const m_rapida_c = ema(mtfCloses, rapida_mtf);
    const m_lenta_c = ema(mtfCloses, lenta_mtf);
    const BBMacd_c = m_rapida_c.map((r, i) => r - m_lenta_c[i]);
    const Avg_c = ema(BBMacd_c, 9);
    const SDev_c = stdev(BBMacd_c, 9);
    const banda_supe_c = Avg_c.map((a, i) => a + stdv_mtf * SDev_c[i]);

    // Project MTF indicators back to base timeframe length
    let BBMacd_mtf = Array(len).fill(0);
    let Avg_mtf = Array(len).fill(0);
    let banda_supe_mtf = Array(len).fill(0);

    for (let i = 0; i < len; i++) {
        let mtfIdx = Math.floor(i / multiplier);
        BBMacd_mtf[i] = BBMacd_c[mtfIdx] !== undefined ? BBMacd_c[mtfIdx] : 0;
        Avg_mtf[i] = Avg_c[mtfIdx] !== undefined ? Avg_c[mtfIdx] : 0;
        banda_supe_mtf[i] = banda_supe_c[mtfIdx] !== undefined ? banda_supe_c[mtfIdx] : 0;
    }

    // --- Signal Evaluation ---
    const last_idx = len - 1;
    
    // Red Team Hotfix: cond_up7 Apple-to-Orange comparison fix (Avg_mtf -> Avg)
    const cond_up7_series = Array(len).fill(false);
    for (let i = 0; i < len; i++) {
        cond_up7_series[i] = (BBMacd[i] > banda_supe[i]) && 
                             (BBMacd_mtf[i] > banda_supe_mtf[i]) && 
                             (BBMacd[i] > Avg[i]) && 
                             (BBMacd_mtf[i] > 0);
    }
    const cond_up7 = cond_up7_series[last_idx];
    
    // [Design v3.2.2] Strong Trend Condition for Rule 8
    // Definition: BBMacd_mtf > 0 AND BBMacd_mtf > banda_supe_mtf AND BBMacd > BBMacd_mtf
    const cond_strong_trend = (BBMacd_mtf[last_idx] > 0) && 
                              (BBMacd_mtf[last_idx] > banda_supe_mtf[last_idx]) && 
                              (BBMacd[last_idx] > BBMacd_mtf[last_idx]);

    // Red Team Hotfix: DHH2 Separation (Pullback formed earlier, then breakout occurs within 5 bars)
    const pullback_formed_series = Array(len).fill(false);
    for (let i = 1; i < len; i++) {
        pullback_formed_series[i] = (result_2_series[i] > result_3_series[i]) && 
                                    (result_2_series[i-1] !== result_2_series[i]) && 
                                    (open[i] > result_2_series[i]);
    }

    const checkDHH2At = (idx) => {
        if (idx < 1) return false;
        if (!cond_up7_series[idx] || open[idx] <= result_2_series[idx]) return false;
        
        // Look back up to 5 bars from idx for pullback confirmation
        for (let k = idx; k >= Math.max(1, idx - 5); k--) {
            if (pullback_formed_series[k]) return true;
        }
        return false;
    };

    let isSignalActive = false;
    // To accommodate dashboard visibility, check if DHH2 fired in the recent 3 candles
    for (let i = last_idx; i > Math.max(0, last_idx - 3); i--) {
        if (checkDHH2At(i)) {
            isSignalActive = true;
            break;
        }
    }

    const rsi2_prev = rsi3[last_idx - 1] !== null ? rsi3[last_idx - 1] : 50;
    const rsi2_curr = rsi3[last_idx] !== null ? rsi3[last_idx] : 50;
    
    // 1. RSI Trigger: Hooking up from pullback region (< 40)
    const trigger_rsi = rsi2_prev < 40 && rsi2_curr > rsi2_prev;

    let trigger_vol = false;
    if (volume.length >= 20) {
        let volSum = 0;
        for (let i = last_idx - 20; i < last_idx; i++) {
            if (i >= 0) volSum += volume[i];
        }
        const volAvg = volSum / 20;
        // 2. Volume Trigger: Meaningful participation (> 1.5x average)
        if (volAvg > 0 && volume[last_idx] >= volAvg * 1.5) {
            trigger_vol = true;
        }
    }

    // 3. Price Action Confirmation: Bullish Candle (Close > Open)
    const bullish_candle = close[last_idx] > open[last_idx];

    // Entry Approved: Removed strict conditions per user request. Sniper uses Top 15 Telegram score filter instead.
    const entry_approved = true;

    // --- Progress & Final Signal Logic ---
    const timeframeMsMap = {
        '2M': 2 * 60 * 1000,
        '5M': 5 * 60 * 1000,
        '15M': 15 * 60 * 1000,
        '30M': 30 * 60 * 1000,
        '1H': 60 * 60 * 1000,
        '2H': 2 * 60 * 60 * 1000,
        '4H': 4 * 60 * 60 * 1000,
        '1D': 24 * 60 * 60 * 1000,
        '2D': 2 * 24 * 60 * 60 * 1000,
        '1W': 7 * 24 * 60 * 60 * 1000
    };
    const tfMs = timeframeMsMap[timeframeStr] || timeframeMsMap['1D'];
    
    // timeArr[last_idx] is usually seconds (unix) or potentially ms. Handle intelligently.
    const candleStartRaw = timeArr[last_idx];
    const candleStart = candleStartRaw > 1e11 ? candleStartRaw : candleStartRaw * 1000;
    const timenow = Date.now();
    let progress = Math.max(0, Math.min(1.0, (timenow - candleStart) / tfMs));
    
    // Signal_HH is strongly defined as DHH2 AND progress > 0.3 AND entry_approved
    const signal_HH = isSignalActive && progress > 0.3 && entry_approved;

    const adxArray = calculateADX(high, low, close, 14);
    const currentADX = adxArray[last_idx] !== null ? adxArray[last_idx] : 0;
    const isTrending = currentADX >= 25;

    // --- Phase 4: Optimal Entry Price & Categorization & Multi-targets ---
    const ema5 = ema(close, 5);
    const ema10 = ema(close, 10);
    const ema20 = ema(close, 20);
    const ema60 = ema(close, 60);
    const ema5_val = ema5[last_idx];
    const ema10_val = ema10[last_idx];
    const ema20_val = ema20[last_idx];
    const ema60_val = ema60[last_idx];

    // [v7.8.30] Calculate KIS/Broker Bonus Score (Institutional/Foreigner flow)
    let bonus_score = 0;
    const kis = ohlcHistory.kis_change_data || {};
    if (kis.foreign_buy > 0) bonus_score += 3;
    if (kis.inst_buy > 0) bonus_score += 5;
    if (kis.foreign_buy > 0 && kis.inst_buy > 0) bonus_score = 10; // Cap at 10 for both
    
    // SMA 5, 10 (Design v3.0)
    const sma5_arr = sma(close, 5);
    const sma10_arr = sma(close, 10);
    const sma5_val = sma5_arr[last_idx];
    const sma10_val = sma10_arr[last_idx];

    // Bollinger Bands (25, 2) logic for BBW (Design v3.0)
    const bbw_adj = 100.0;
    const bbw_mult = 50.0;
    const length_BBW = 25;
    
    const calculateBBWAndLowest = (src_close) => {
        if (!src_close || src_close.length < length_BBW) return { val: 0, low5: 0, series: [] };
        const b_sma = sma(src_close, length_BBW);
        const b_stdev = stdev(src_close, length_BBW);
        const series = b_sma.map((s, i) => {
            if (s === 0 || s === null || b_stdev[i] === null) return null;
            return (((s + 2 * b_stdev[i]) - (s - 2 * b_stdev[i])) / s) * 100 * bbw_mult + bbw_adj;
        });
        const val = series[series.length - 1] || 0;
        let low5 = val;
        if (series.length >= 6) {
            let min_v = val;
            for (let i = 1; i <= 5; i++) {
                const v = series[series.length - 1 - i];
                if (v !== null && v < min_v) min_v = v;
            }
            low5 = min_v;
        }
        return { val, low5, series };
    };

    const currentBBW = calculateBBWAndLowest(close);
    
    // [Design v3.0] Internal Resampling Logic: 
    // Calculate MTF (Multi-Timeframe) BBW. 
    // [v7.8.31] SECURITY FIX: Only resample if input timeframe is NOT already aggregate.
    let resampled2x;
    if (['2H', '4H', '2D', '4D', '1W'].includes(timeframeStr)) {
        // [v7.8.31] Corrected Bypass: Input is already aggregated, do not resample again.
        resampled2x = { time: timeArr, open, high, low, close, volume };
    } else {
        resampled2x = resampleChartData({ time: timeArr, open, high, low, close, volume }, 2, timeframeStr);
    }
    const mtfBBW = calculateBBWAndLowest(resampled2x.close);

    // [v6.4.0] New Signal Logic (Strong & Absolute)
    const multiplier_bbw = 2;
    let bbw_mtf_series = Array(len).fill(0);
    for (let i = 0; i < len; i++) {
        let mtfIdx = Math.floor(i / multiplier_bbw);
        bbw_mtf_series[i] = mtfBBW.series[mtfIdx] !== undefined ? mtfBBW.series[mtfIdx] : 0;
    }
    const bbw_series = currentBBW.series;
    
    // THH: crossover(bbw, bbw_mtf)
    const THH = last_idx > 0 && bbw_series[last_idx] > bbw_mtf_series[last_idx] && (bbw_series[last_idx - 1] || 0) <= (bbw_mtf_series[last_idx - 1] || 0);
    // RHH: bbw > bbw_mtf
    const RHH = bbw_series[last_idx] > bbw_mtf_series[last_idx];
    // bg_up_1: BBMacd > banda_supe
    const bg_up_1 = BBMacd[last_idx] > banda_supe[last_idx];
    // cond_up8: (BBMacd > banda_supe) and (BBMacd_mtf > banda_supe_mtf) and BBMacd_mtf > 0 and BBMacd > BBMacd_mtf
    const cond_up8 = (BBMacd[last_idx] > banda_supe[last_idx]) && 
                     (BBMacd_mtf[last_idx] > banda_supe_mtf[last_idx]) && 
                     (BBMacd_mtf[last_idx] > 0) && 
                     (BBMacd[last_idx] > BBMacd_mtf[last_idx]);

    // 강력신호 (signal_H): THH and progress > 0.7 and bg_up_1
    const signal_H = THH && progress > 0.7 && bg_up_1;
    // 절대신호 (signal_HHH): RHH and cond_up8
    const signal_HHH = RHH && cond_up8;

    // Standard BB (20, 2) for price targets
    const sma20 = sma(close, 20);
    const sma60 = sma(close, 60);
    const sma120 = sma(close, 120);
    const stdev20 = stdev(close, 20);
    const bb_lower = sma20[last_idx] !== null ? sma20[last_idx] - 2 * stdev20[last_idx] : null;
    const bb_upper = sma20[last_idx] !== null ? sma20[last_idx] + 2 * stdev20[last_idx] : null;

    const lowest3_val = lowest_low_3_2[last_idx] !== null ? lowest_low_3_2[last_idx] : low[last_idx];

    let category = "기타 (관망)";
    let entry_price = close[last_idx];
    let style_tag = "관망"; // [v8.8.24] New Qualitative Meta

    // [v8.8.24] Realistic Entry Price Logic: Prevent >10% disconnects during market hours
    const currentPrice = close[last_idx];
    const getRealisticTarget = (target) => {
        if (!target || target === 0) return currentPrice;
        const discount = (currentPrice - target) / currentPrice;
        if (discount > 0.10) { // If target is more than 10% away, seek closer support
            return Math.max(ema5_val, ema10_val, ema20_val); 
        }
        return target;
    };

    if (isTrending && cond_up7) {
        category = "추세 지속형";
        style_tag = currentADX > 30 ? "단기 추세" : "스윙";
        // Use EMA 20 or RSI Pivot as support for uptrends
        entry_price = getRealisticTarget(Math.max(ema20_val, result_2_series[last_idx]));
    } else if (!isTrending) {
        category = "박스권 횡보";
        style_tag = "박스권";
        entry_price = getRealisticTarget(bb_lower !== null ? bb_lower : lowest3_val);
    } else if (isTrending && !cond_up7) {
        if (rsi2_curr < 40) {
            category = "바닥권 반등";
            style_tag = "역배열 반등";
            entry_price = getRealisticTarget(lowest3_val); 
        } else {
            category = "하락 추세";
            style_tag = "관망";
            entry_price = getRealisticTarget(lowest3_val);
        }
    }

    return {
        result_1: Math.round(result_1_series[last_idx]),
        result_2: Math.round(result_2_series[last_idx]),
        result_3: Math.round(result_3_series[last_idx]),
        stop_loss: Math.round(result_3_series[last_idx] * 0.98), 
        cond_up7,
        DHH2: isSignalActive,
        progress: Number(progress.toFixed(3)),
        signal_HH: signal_HH,
        adx: currentADX,
        isTrending: isTrending,
        trigger_rsi,
        trigger_vol,
        entry_approved,
        category,
        style_tag,
        entry_price: entry_price ? (entry_price > close[last_idx] ? Math.round(close[last_idx]) : Math.round(entry_price)) : 0,
        target_price_1: Math.max(bb_upper || 0, close[last_idx] * 1.03),
        target_price_2: Math.max(sma120[last_idx] || 0, (bb_upper || close[last_idx] * 1.03) * 1.05),
        stop_loss_v2: Math.round(result_3_series[last_idx] * 0.98), 
        ema5: ema5_val ? Math.round(ema5_val) : 0,
        ema10: ema10_val ? Math.round(ema10_val) : 0,
        ema20: ema20_val ? Math.round(ema20_val) : 0,
        ema60: ema60_val ? Math.round(ema60_val) : 0,
        sma5: sma5_val ? Math.round(sma5_val) : 0,
        sma10: sma10_val ? Math.round(sma10_val) : 0,
        sma20: sma20[last_idx] ? Math.round(sma20[last_idx]) : 0,
        sma60: sma60[last_idx] ? Math.round(sma60[last_idx]) : 0,
        sma120: sma120[last_idx] ? Math.round(sma120[last_idx]) : 0,
        bb_upper: bb_upper ? Math.round(bb_upper) : 0,
        current_price: close[last_idx] ? Math.round(close[last_idx]) : 0,
        open_price: open[last_idx] ? Math.round(open[last_idx]) : 0,
        prev_close: (last_idx > 0 && close[last_idx - 1]) ? Math.round(close[last_idx - 1]) : 0,
        bbw: Number(currentBBW.val.toFixed(4)),
        lowest_bbw_5: Number(currentBBW.low5.toFixed(4)),
        is_strong_signal: signal_HHH,
        signal_H: signal_H,          
        signal_HHH: signal_HHH,      
        cond_strong_trend: cond_strong_trend,
        con_mtf: Number(mtfBBW.low5.toFixed(4)),
        bbw_mtf: Number(mtfBBW.val.toFixed(4)),
        bonus_score: bonus_score, 
        daily_high: kis.stck_hgpr ? parseInt(kis.stck_hgpr) : (high[last_idx] ? Math.round(high[last_idx]) : 0),
        daily_low: kis.stck_lwpr ? parseInt(kis.stck_lwpr) : (low[last_idx] ? Math.round(low[last_idx]) : 0),
        daily_open: kis.stck_oprc ? parseInt(kis.stck_oprc) : (open[last_idx] ? Math.round(open[last_idx]) : 0),
        kis_change_data: ohlcHistory.kis_change_data || null
    };
}

module.exports = { calculateSignals };

// ─────────────────────────────────────────────────────────────────────────
// [CLI Entry Point] Handle standalone execution (spawning from server.cjs)
// ─────────────────────────────────────────────────────────────────────────

if (require.main === module) {
    async function runCliSync() {
        const args = process.argv.slice(2);
        const timeframes = args.length > 0 ? args : ['1D'];
        const isIntegrated = process.env.SYNC_MODE === 'integrated';

        console.log(`[Analyzer CLI] Starting sync for: ${timeframes.join(', ')}`);

        if (!fs.existsSync(STOCK_MASTER_FILE)) {
            console.error(`[Analyzer CLI] Error: stock_master.json not found at ${STOCK_MASTER_FILE}`);
            process.exit(1);
        }

        try {
            let kisToken = null;
            try { 
                kisToken = await getKisAccessToken(); 
            } catch(e) { 
                console.error("[Analyzer CLI] KIS Token failed, proceeding with Yahoo only."); 
            }

            let stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));
            if (process.env.STOCK_FILTER) {
                const codes = process.env.STOCK_FILTER.split(',').map(s => s.trim());
                stocks = stocks.filter(s => codes.includes(s.code));
                console.log(`[Analyzer CLI] Filtering stocks based on STOCK_FILTER: ${codes.join(', ')}`);
            }
            
            // [v7.8.27] Automated multi-timeframe analysis for filtered stocks
            // If STOCK_FILTER is set, we ensure we have all TFs needed for ScoringService (30M..1D)
            const activeTimeframes = [...timeframes];
            if (process.env.STOCK_FILTER && !activeTimeframes.includes('2H')) activeTimeframes.push('2H');
            if (process.env.STOCK_FILTER && !activeTimeframes.includes('1H')) activeTimeframes.push('1H');
            if (process.env.STOCK_FILTER && !activeTimeframes.includes('30M')) activeTimeframes.push('30M');
            if (process.env.STOCK_FILTER && !activeTimeframes.includes('4H')) activeTimeframes.push('4H');
            if (process.env.STOCK_FILTER && !activeTimeframes.includes('1D')) activeTimeframes.push('1D');

            const saveSignals = (newSignals, saveTFs) => {
                if (!newSignals || newSignals.length === 0) {
                    console.warn(`[Analyzer CLI] Warning: No new signals to save for timeframes: ${saveTFs.join(', ')}. Skipping save to prevent data loss.`);
                    return;
                }

                let currentSignals = [];
                if (fs.existsSync(SIGNALS_FILE)) {
                    try { 
                        currentSignals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8')); 
                    } catch(e) { 
                        console.error("[Analyzer CLI] Error reading signals.json, starting fresh.");
                        currentSignals = []; 
                    }
                }
                const tfSet = new Set(saveTFs);
                let filtered;
                if (process.env.ADDITIVE_SAVE === 'true') {
                    // Additive mode: Only remove the specific (code, tf) we are updating
                    const updatedKeys = new Set(newSignals.map(s => `${s.code}_${s.timeframe}`));
                    filtered = currentSignals.filter(s => !updatedKeys.has(`${s.code}_${s.timeframe}`));
                    console.log(`[Analyzer CLI] Additive Save Mode: Preserving other stocks for ${saveTFs.join(', ')}`);
                } else {
                    // Standard mode: Replace entire timeframe
                    filtered = currentSignals.filter(s => !tfSet.has(s.timeframe));
                }
                const merged = [...filtered, ...newSignals];
                
                // Atomic Write (Temp file -> Rename)
                const tempFile = SIGNALS_FILE + '.tmp';
                try {
                    fs.writeFileSync(tempFile, JSON.stringify(merged, null, 2));
                    fs.renameSync(tempFile, SIGNALS_FILE);
                } catch (err) {
                    console.error("[Analyzer CLI] Atomic write failed:", err.message);
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                }
            };

            let allTimeframesResults = [];
            const intervalMap = { '2M': '2m', '5M': '5m', '15M': '15m', '30M': '30m', '1H': '1h', '2H': '1h', '4H': '1h', '1D': '1d', '2D': '1d', '1W': '1wk' };
            const globalHistoryCache = {};
            const allSignalsMap = new Map(); // [Phase 4] Aggregator for DB SSOT
            const kisCache = {}; // [v8.0.0] Shared KIS cache for multi-timeframe run

            // [Phase 4] Helper to bridge Analyzer -> DB SSOT
            const syncToDB = async (stockCode, stockName, tfMap, kisData) => {
                if (!tfMap.has('1D')) return; // Daily snapshot requires 1D data base
                
                const sig1D = tfMap.get('1D');
                const sig2H = tfMap.get('2H') || sig1D; // [v7.8.27] Fallback to 1D if 2H missing

                const scoringResult = ScoringService.calculateTotalScore(
                    Object.fromEntries(tfMap), 
                    { current_price: sig1D.current_price, kis_change_data: kisData }
                );

                const strategyObj = ScoringService.generateTradingStrategy(scoringResult.totalScore, sig2H, sig1D);

                const indicators = {
                    name: stockName,
                    currentPrice: sig1D.current_price,
                    changeRate: kisData?.rate || 0,
                    tradeAmount: kisData?.trade_amount || 0,
                    trendType: sig1D.category || strategyObj.strategy_day.split(' ')[0], // Best effort category
                    trendStrength: String(sig1D.adx || 0),
                    starGrade: String(scoringResult.starGrade),
                    score: scoringResult.totalScore,
                    strategyDay: strategyObj.strategy_day,
                    strategySwing: strategyObj.strategy_swing,
                    // [v7.9.2] Aggressive Entry Price for High Momentum (Gap-up Response)
                    entryPrice1: (() => {
                        const rawE1 = sig2H.result_1 || sig2H.ema5 || 0;
                        const score = scoringResult.totalScore;
                        const curr = sig1D.current_price;
                        
                        // [RULE] If score >= 80, entryPrice1 should be aggressive (at or near current price)
                        if (score >= 80) return Math.round(curr); 
                        
                        // Standard logic for others: 98% ceiling guard
                        return Math.round(rawE1 > curr ? curr * 0.98 : rawE1);
                    })(),
                    entryPrice2: Math.round(sig2H.result_3 || sig2H.ema20 || 0),                     
                    stopLoss: Math.round((sig2H.result_3 || sig2H.ema20 || 0) * 0.97), // Slightly wider SL for gap candidates
                    targetPrice1: (() => {
                        const rawT1 = sig1D.result_1 || sig1D.bb_upper || 0;
                        return Math.round(rawT1 < sig1D.current_price ? sig1D.current_price * 1.10 : rawT1);
                    })(),
                    targetPrice2: Math.round(sig1D.target_price_2 || Math.round((sig1D.result_1 || sig1D.bb_upper || 0) * 1.15)),
                    isValidationExempt: false,
                    // [v7.9.0] New Demand Metrics
                    foreignBuy: kisData?.foreign_buy || 0,
                    instBuy: kisData?.inst_buy || 0
                };

                await signalReportService.upsertSignalReport(stockCode, indicators);
                return { code: stockCode, indicators };
            };

            for (const tf of activeTimeframes) {
                const interval = intervalMap[tf] || '1d';
                console.log(`[Analyzer CLI] Syncing ${tf} (Using interval ${interval})...`);

                const tfResults = [];
                for (let i = 0; i < stocks.length; i++) {
                    const stock = stocks[i];
                    // Optimization: Cache by interval (e.g. 1d) so 1D and 2D share raw data
                    const cacheKey = `${stock.code}_${interval}`;

                    try {
                        let rawHistory;
                        if (globalHistoryCache[cacheKey]) {
                            rawHistory = globalHistoryCache[cacheKey];
                        } else {
                            // [v3.1.0] Determine fetch depth based on interval
                            let fetchDays = 60;
                            if (interval === '2m') fetchDays = 2;
                            else if (interval === '5m') fetchDays = 5; 
                            else if (interval === '15m') fetchDays = 15; 
                            else if (interval === '30m') fetchDays = 30;
                            else if (interval === '1h') fetchDays = 60;
                            else if (interval === '1d') fetchDays = 365; // Cover 2D as well
                            else if (interval === '1wk') fetchDays = 1000;

                            try {
                                rawHistory = await fetchHybridHistory(stock, fetchDays, interval, kisToken, kisCache);
                            } catch (fetchErr) {
                                if (fetchErr.type === 'TOKEN_EXPIRED') {
                                    console.log(`[Analyzer CLI] Token expired during ${stock.code}. Refreshing...`);
                                    kisToken = await getKisAccessToken(true);
                                    rawHistory = await fetchHybridHistory(stock, fetchDays, interval, kisToken);
                                } else {
                                    console.error(`[Analyzer CLI] Data Fetching Error for ${stock.code}: ${fetchErr.message}`);
                                    continue; 
                                }
                            }
                            if (rawHistory) globalHistoryCache[cacheKey] = rawHistory;
                        }

                        if (rawHistory && rawHistory.close && rawHistory.close.length > 50) {
                            let processedHistory = rawHistory;
                            if (tf === '2M') processedHistory = resampleChartData(rawHistory, 2, tf);
                            else if (tf === '2H') processedHistory = resampleChartData(rawHistory, 2, tf);
                            else if (tf === '4H') processedHistory = resampleChartData(rawHistory, 4, tf);
                            else if (tf === '2D') processedHistory = resampleChartData(rawHistory, 2, tf);

                            const signal = calculateSignals(processedHistory, tf);
                            if (signal) {
                                const finalSignal = { 
                                    ...signal, 
                                    code: stock.code, 
                                    name: stock.name, 
                                    timeframe: tf, 
                                    timestamp: Date.now(), 
                                    id: uuidv4(), 
                                    kis_change_data: processedHistory.kis_change_data 
                                };
                                tfResults.push(finalSignal);

                                // [Phase 4] Update Aggregator
                                if (!allSignalsMap.has(stock.code)) allSignalsMap.set(stock.code, new Map());
                                allSignalsMap.get(stock.code).set(tf, finalSignal);
                            }
                        }
                    } catch (e) {
                        console.error(`[Analyzer CLI] Error ${stock.code} (${stock.name}): ${e.message}`);
                    }

                    // Incremental progress and save
                    if ((i + 1) % 50 === 0 || i === stocks.length - 1) {
                        console.log(`[PROGRESS] ${tf}:${i + 1}/${stocks.length}`);
                        saveSignals(tfResults, [tf]);
                    }
                    await new Promise(r => setTimeout(r, 100)); 
                }
                allTimeframesResults.push(...tfResults);
            }

            // [v7.8.28] Final Sync to DB after ALL timeframes are processed (Ensures full Score)
            console.log(`[SSOT] Executing final aggregate sync to DB for processed stocks (${allSignalsMap.size})...`);
            const allIndicators = [];
            for (const [code, tfMap] of allSignalsMap) {
                const stock = stocks.find(s => s.code === code);
                const sig1D = tfMap.get('1D');
                if (stock && sig1D) {
                    const res = await syncToDB(code, stock.name, tfMap, sig1D.kis_change_data);
                    if (res) allIndicators.push(res);
                }
            }

            // [v7.9.0] Identify and Save Top 5 to DailyTop5 Table
            console.log(`[SSOT] Identifying Top 5 stocks for historical persistence...`);
            const top5 = allIndicators
                .sort((a, b) => b.indicators.score - a.indicators.score)
                .slice(0, 5);

            for (const item of top5) {
                await signalReportService.saveDailyTop5(item.code, item.indicators);
            }

            // [v8.1.0] Invalidate Top 5 SSOT Cache to reflect new results immediately
            console.log(`[SSOT] Invalidating Redis cache (mp:top:*) to refresh UI...`);
            try {
                await redis.del('mp:top:5');
                await redis.del('mp:top:10');
                await redis.del('mp:top:20');
            } catch (cacheErr) {
                console.warn(`[SSOT] Cache invalidation warning: ${cacheErr.message}`);
            }

            console.log(`[Analyzer CLI] Full synchronization completed for: ${activeTimeframes.join(', ')}`);
        } catch (e) {
            console.error("[Analyzer CLI] Fatal Error:", e.message);
        }
    }

    runCliSync().catch(err => {
        console.error('[Analyzer CLI Error]', err);
        process.exit(1);
    });
}
