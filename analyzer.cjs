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
const { getKstDateString, getKstNow } = require('./src/utils/kst.cjs');

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
    
    // [TASK-A10] 비동기 파일 I/O 및 원자적 쓰기 (Atomic Write)
    const tokenData = JSON.stringify({ token: kisAccessToken, expiry: kisTokenExpiry });
    const tempPath = KIS_TOKEN_FILE + '.tmp';
    try {
        await fs.promises.writeFile(tempPath, tokenData, 'utf8');
        if (fs.existsSync(KIS_TOKEN_FILE)) fs.unlinkSync(KIS_TOKEN_FILE);
        fs.renameSync(tempPath, KIS_TOKEN_FILE);
    } catch (err) {
        console.error(`[KIS Token] Save failed: ${err.message}`);
    }
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

    for (let i = 0; i < raw.time.length; i++) {
        const date = new Date(raw.time[i] * 1000);
        date.setUTCHours(date.getUTCHours() + 9);
        const dayStr = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;

        if (currentCandle && currentDayStr !== dayStr) {
            // [TASK-A03] 날짜 변경 감지
            if (!isDayBased) {
                // 분봉 기반 리샘플링은 날짜 변경 시 무조건 flush
                resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
                resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
                resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
                currentCandle = null; candleCount = 0;
            } else if (candleCount >= hourCount) {
                // 일봉 기반: 이미 지정된 일수(hourCount)를 다 채웠으므로 flush
                resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
                resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
                resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
                currentCandle = null; candleCount = 0;
            } else {
                // 아직 그룹의 n일차 진행 중
                candleCount++;
                currentDayStr = dayStr;
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
            
            // 분봉 리샘플링 시 candleCount는 캔들 개수(전환배수)로 사용
            if (!isDayBased) {
                candleCount++;
                if (candleCount >= hourCount) {
                    resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
                    resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
                    resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
                    currentCandle = null; candleCount = 0;
                }
            }
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
        let personBuy = 0;

        if (kisCache && kisCache[stock.code]) {
            kisData = kisCache[stock.code].price;
            foreignBuy = kisCache[stock.code].foreign_buy;
            instBuy = kisCache[stock.code].inst_buy;
            personBuy = kisCache[stock.code].person_buy;
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
                    const out = trendRes.data.output;
                        const row = Array.isArray(out) ? out[0] : out;
                        if (row) {
                            foreignBuy = parseInt(row.frgn_ntby_qty) || 0;
                            instBuy = parseInt(row.orgn_ntby_qty) || 0;
                            // [TASK-A12] 개인 순매수 데이터도 확보하여 보너스 점수 정확도 향상
                            personBuy = parseInt(row.prsn_ntby_qty) || 0;
                        }
                } catch (trendErr) {
                    console.warn(`[KIS Trend] Failed for ${stock.code}: ${trendErr.message}`);
                }

                if (kisCache) {
                    kisCache[stock.code] = { price: kisData, foreign_buy: foreignBuy, inst_buy: instBuy, person_buy: personBuy };
                }
            } catch(e) {
                if (e.response && e.response.data && e.response.data.msg_cd === 'EGW00123') {
                    throw { type: 'TOKEN_EXPIRED', originalError: e };
                }
                console.warn(`[KIS API] Failed for ${stock.code}: ${e.message}`);
            }
        }

        if (kisData && kisData.stck_prpr) {
            let currentPrice = parseInt(kisData.stck_prpr);
            let currentHigh = parseInt(kisData.stck_hgpr);
            let currentLow = parseInt(kisData.stck_lwpr);
            
            // [v9.2.0] After-Hours Price Red-Team Fix
            // KST 기준 16:00 ~ 20:30 사이에는 시간외단일가(ovtm_untp_prpr)를 우선 확인
            const kstNow = getKstNow();
            const kstHour = kstNow.getUTCHours();
            const overtimePrice = parseInt(kisData.ovtm_untp_prpr || 0);
            
            // 장마감(16:00) 이후 시간외 가격이 존재하면 이를 현재가로 채택
            if (kstHour >= 16 && kstHour <= 20 && overtimePrice > 0) {
                console.log(`[Analyzer] Applying After-Hours Price for ${stock.code}: ${overtimePrice}`);
                currentPrice = overtimePrice;
            }

            chartData.kis_change_data = {
                sign: kisData.prdy_vrss_sign,
                change: parseInt(kisData.prdy_vrss),
                rate: parseFloat(kisData.prdy_ctrt),
                trade_amount: parseInt(kisData.acml_tr_pbmn),
                acml_vol: parseInt(kisData.acml_vol || 0),
                vol_rate: parseFloat(kisData.prdy_vol_vrss_rt || 0),
                foreign_buy: foreignBuy,
                inst_buy: instBuy,
                person_buy: personBuy,
                stck_prpr: currentPrice // Explicitly pass the derived price
            };

            // [v9.2.0] After-hours metrics sync
            if (kstHour >= 16 && kstHour <= 20 && overtimePrice > 0) {
                chartData.kis_change_data.change = parseInt(kisData.ovtm_untp_prdy_vrss || kisData.prdy_vrss);
                chartData.kis_change_data.rate = parseFloat(kisData.ovtm_untp_prdy_ctrt || kisData.prdy_ctrt);
                chartData.kis_change_data.sign = kisData.ovtm_untp_prdy_vrss_sign || kisData.prdy_vrss_sign;
            }

            const lastIdx = chartData.close.length - 1;
            if (lastIdx >= 0) {
                chartData.close[lastIdx] = currentPrice;
                chartData.high[lastIdx] = Math.max(chartData.high[lastIdx], currentHigh);
                chartData.low[lastIdx] = Math.min(chartData.low[lastIdx], currentLow);
            }
        }
    }
    return chartData;
}

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
        if (i < period - 1) { results.push(null); } 
        else {
            let sum = 0;
            for (let j = 0; j < period; j++) { sum += src[i - j]; }
            results.push(sum / period);
        }
    }
    return results;
}

function lowest(source, period) {
    let result = [];
    for (let i = 0; i < source.length; i++) {
        if (i < period - 1) { result.push(null); } 
        else {
            let win = source.slice(i - period + 1, i + 1);
            result.push(Math.min(...win));
        }
    }
    return result;
}

function highest(source, period) {
    let result = [];
    for (let i = 0; i < source.length; i++) {
        if (i < period - 1) { result.push(null); } 
        else {
            let win = source.slice(i - period + 1, i + 1);
            result.push(Math.max(...win));
        }
    }
    return result;
}

function stdev(src, period) {
    let results = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) { results.push(null); continue; }
        let window = src.slice(i - period + 1, i + 1);
        let mean = window.reduce((a, b) => a + b) / period;
        // [TASK-A08] 표본 표준편차 (N-1) 적용 - Pine Script ta.stdev 정합성
        const divisor = period > 1 ? period - 1 : 1;
        let variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / divisor;
        results.push(Math.sqrt(variance));
    }
    return results;
}

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
    for (let i = 1; i < close.length; i++) {
        if (i < period) { smoothTR.push(null); smoothPlusDM.push(null); smoothMinusDM.push(null); continue; }
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
        if (plusDI + minusDI === 0) { dx.push(0); } else { dx.push(100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI)); }
    }
    let dxOffset = period;
    for (let i = period * 2 - 1; i < close.length; i++) {
        if (i === period * 2 - 1) { adx[i] = dx.slice(0, period).reduce((a, b) => a + b, 0) / period; } 
        else { adx[i] = ((adx[i - 1] * (period - 1)) + dx[i - dxOffset]) / period; }
    }
    return adx;
}

// --- Pine Indicator Implementation ---
function calculateSignals(ohlcHistory, timeframeStr = '1D') {
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
                close: rawClose[i], open: rawOpen[i], high: rawHigh[i], low: rawLow[i], volume: rawVolume[i] || 0, time: timestamps[i]
            });
        }
    }
    if (cleanData.length < 50) return null;

    const close = cleanData.map(d => d.close);
    const open = cleanData.map(d => d.open);
    const low = cleanData.map(d => d.low);
    const high = cleanData.map(d => d.high);
    const volume = cleanData.map(d => d.volume);
    const timeArr = cleanData.map(d => d.time);
    const len = close.length;

    const rsi14 = rsi(close, 14);
    const P_1 = rsi14.map((val, i) => i > 1 ? (rsi14[i-2] < rsi14[i-1] && rsi14[i-1] > rsi14[i]) : false);
    const highest_high_3_1 = highest(high, 3);
    const highest_high_rsi_1 = highest(high, 14);
    let result_1_series = Array(len).fill(0);
    let last_val_B1 = null, prev_val_B1 = null, Q_1 = null, QQ_1 = null;
    for (let i = 0; i < len; i++) {
        if (P_1[i]) {
            prev_val_B1 = last_val_B1; last_val_B1 = highest_high_3_1[i];
            if (prev_val_B1 !== null && last_val_B1 < prev_val_B1) { QQ_1 = Q_1; Q_1 = highest_high_rsi_1[i]; }
        }
        if (Q_1 !== null && QQ_1 !== null) { result_1_series[i] = Q_1 < QQ_1 ? Q_1 : QQ_1; } 
        else if (i > 0) { result_1_series[i] = result_1_series[i-1]; }
    }

    const rsi3 = rsi(close, 3);
    const P_2 = rsi3.map((val, i) => i > 1 ? (rsi3[i-2] > rsi3[i-1] && rsi3[i-1] < rsi3[i]) : false);
    const lowest_low_3_2 = lowest(low, 3);
    const lowest_low_rsi_2 = lowest(rsi3, 3); // [TASK-A06] low 대신 rsi3 사용
    let result_2_series = Array(len).fill(0);
    let last_val_B2 = null, prev_val_B2 = null, Q_2 = null, QQ_2 = null;
    for (let i = 0; i < len; i++) {
        if (P_2[i]) {
            prev_val_B2 = last_val_B2; last_val_B2 = lowest_low_3_2[i];
            if (prev_val_B2 !== null && last_val_B2 > prev_val_B2) { QQ_2 = Q_2; Q_2 = lowest_low_rsi_2[i]; }
        }
        if (Q_2 !== null && QQ_2 !== null) { result_2_series[i] = Q_2 > QQ_2 ? Q_2 : QQ_2; } 
        else if (i > 0) { result_2_series[i] = result_2_series[i-1]; }
    }

    const rsiPeriod_3 = 10;
    const rsi10 = rsi(close, rsiPeriod_3);
    const P_3 = rsi10.map((val, i) => i > 1 ? (rsi10[i-2] > rsi10[i-1] && rsi10[i-1] < rsi10[i]) : false);
    const lowest_low_3_3 = lowest(low, 3);
    const lowest_low_rsi_3 = lowest(low, rsiPeriod_3);
    let result_3_series = Array(len).fill(0);
    let last_val_B3 = null, prev_val_B3 = null, Q_3 = null, QQ_3 = null;
    for (let i = 0; i < len; i++) {
        if (P_3[i]) {
            prev_val_B3 = last_val_B3; last_val_B3 = lowest_low_3_3[i];
            if (prev_val_B3 !== null && last_val_B3 > prev_val_B3) { QQ_3 = Q_3; Q_3 = lowest_low_rsi_3[i]; }
        }
        if (Q_3 !== null && QQ_3 !== null) { result_3_series[i] = Q_3 > QQ_3 ? Q_3 : QQ_3; } 
        else if (i > 0) { result_3_series[i] = result_3_series[i - 1]; }
    }

    const m_rapida = ema(close, 8), m_lenta = ema(close, 26);
    const BBMacd = m_rapida.map((r, i) => r - m_lenta[i]);
    const Avg = ema(BBMacd, 9), SDev = stdev(BBMacd, 9);
    const banda_supe = Avg.map((a, i) => a + 0.2 * SDev[i]);

    let mtfCloses = [];
    // [TASK-A13] MTF 리샘플링 로직 단순화 (i+1 중복 방어 및 ceil(N/2) 정합성 확보)
    for (let i = 1; i < len; i += 2) { 
        mtfCloses.push(close[i]); 
    }
    if (len % 2 !== 0) {
        mtfCloses.push(close[len - 1]);
    }
    const m_rapida_c = ema(mtfCloses, 12), m_lenta_c = ema(mtfCloses, 39);
    const BBMacd_c = m_rapida_c.map((r, i) => r - m_lenta_c[i]);
    const Avg_c = ema(BBMacd_c, 9), SDev_c = stdev(BBMacd_c, 9);
    const banda_supe_c = Avg_c.map((a, i) => a + 0.4 * SDev_c[i]);

    let BBMacd_mtf = Array(len).fill(0), Avg_mtf = Array(len).fill(0), banda_supe_mtf = Array(len).fill(0);
    for (let i = 0; i < len; i++) {
        let mtfIdx = Math.floor(i / 2);
        BBMacd_mtf[i] = BBMacd_c[mtfIdx] || 0; Avg_mtf[i] = Avg_c[mtfIdx] || 0; banda_supe_mtf[i] = banda_supe_c[mtfIdx] || 0;
    }

    const last_idx = len - 1;
    const cond_up7 = (BBMacd[last_idx] > banda_supe[last_idx]) && 
                     (BBMacd_mtf[last_idx] > banda_supe_mtf[last_idx]) && 
                     (BBMacd[last_idx] > Avg[last_idx]) && 
                     (BBMacd_mtf[last_idx] > 0);
    
    const cond_strong_trend = (BBMacd_mtf[last_idx] > 0) && (BBMacd_mtf[last_idx] > banda_supe_mtf[last_idx]) && (BBMacd[last_idx] > BBMacd_mtf[last_idx]);

    const pullback_formed_series = Array(len).fill(false);
    for (let i = 1; i < len; i++) {
        pullback_formed_series[i] = (result_2_series[i] > result_3_series[i]) && (result_2_series[i-1] !== result_2_series[i]) && (open[i] > result_2_series[i]);
    }
    const checkDHH2At = (idx) => {
        if (idx < 1 || !cond_up7 || open[idx] <= result_2_series[idx]) return false;
        for (let k = idx; k >= Math.max(1, idx - 5); k--) { if (pullback_formed_series[k]) return true; }
        return false;
    };
    let isSignalActive = false;
    for (let i = last_idx; i > Math.max(0, last_idx - 3); i--) { if (checkDHH2At(i)) { isSignalActive = true; break; } }

    const rsi2_prev = rsi3[last_idx - 1] || 50, rsi2_curr = rsi3[last_idx] || 50;
    const trigger_rsi = rsi2_prev < 40 && rsi2_curr > rsi2_prev;
    let trigger_vol = false;
    if (volume.length >= 20) {
        let volSum = 0; for (let i = last_idx - 20; i < last_idx; i++) { if (i >= 0) volSum += volume[i]; }
        if (volSum > 0 && volume[last_idx] >= (volSum/20) * 1.5) trigger_vol = true;
    }
    
    const timeframeMsMap = { '2M': 120000, '5M': 300000, '15M': 900000, '30M': 1800000, '1H': 3600000, '2H': 7200000, '4H': 14400000, '1D': 86400000, '2D': 172800000, '1W': 604800000 };
    // [TASK-A09] Yahoo API 타임스탬프(초 단위)를 밀리초로 통일
    const candleStart = timeArr[last_idx] * 1000;
    let progress = Math.max(0, Math.min(1.0, (Date.now() - candleStart) / (timeframeMsMap[timeframeStr] || 86400000)));
    const signal_HH = isSignalActive && progress > 0.3;

    const adxArray = calculateADX(high, low, close, 14);
    const currentADX = adxArray[last_idx] || 0;
    const ema5_val = ema(close, 5)[last_idx], ema10_val = ema(close, 10)[last_idx], ema20_val = ema(close, 20)[last_idx];
    
    const kis = ohlcHistory.kis_change_data || {};
    const bonus_score = ScoringService.calculateBonusScore(kis.foreign_buy, kis.inst_buy, kis.person_buy);

    const currentBBW = (function(src) {
        const b_sma = sma(src, 25), b_stdev = stdev(src, 25);
        const series = b_sma.map((s, i) => (s && b_stdev[i]) ? (4 * b_stdev[i] / s) * 100 * 50 + 100 : null);
        const val = series[series.length - 1] || 0;
        let low5 = val;
        if (series.length >= 6) {
            let win = series.slice(-6, -1).filter(v => v !== null);
            if (win.length > 0) low5 = Math.min(...win, val);
        }
        return { val, low5, series };
    })(close);

    const mtfBBW = (function(src) {
        let resampled = []; for (let i = 0; i < src.length; i += 2) { resampled.push(src[Math.min(i + 1, src.length - 1)]); }
        const b_sma = sma(resampled, 25), b_stdev = stdev(resampled, 25);
        const series = b_sma.map((s, i) => (s && b_stdev[i]) ? (4 * b_stdev[i] / s) * 100 * 50 + 100 : null);
        return { val: series[series.length - 1] || 0, low5: 0, series };
    })(close);

    const bbw_series = currentBBW.series, bbw_mtf_v = mtfBBW.val;
    const THH = last_idx > 0 && bbw_series[last_idx] > bbw_mtf_v && (bbw_series[last_idx-1] || 0) <= bbw_mtf_v;
    const RHH = bbw_series[last_idx] > bbw_mtf_v;
    const signal_H = THH && progress > 0.7 && BBMacd[last_idx] > banda_supe[last_idx];
    const signal_HHH = RHH && cond_strong_trend;

    const sma20 = sma(close, 20), stdev20 = stdev(close, 20);
    const bb_upper = sma20[last_idx] ? sma20[last_idx] + 2 * stdev20[last_idx] : close[last_idx] * 1.07;

    const currentPrice = close[last_idx];
    const getRealisticTarget = (target, maxDiscount = 0.05) => {
        if (!target || target === 0) return null; // [TASK-A05] 0인 경우 null 반환
        const discount = (currentPrice - target) / currentPrice;
        if (discount > maxDiscount || discount < -0.01) {
            const support = Math.max(ema5_val, ema10_val, ema20_val);
            return (currentPrice - support) / currentPrice > maxDiscount ? currentPrice * 0.985 : support;
        }
        return target;
    };

    let category = (!currentADX || currentADX < 25) ? "박스권 횡보" : (cond_up7 ? "추세 지속형" : "하락 추세");

    return {
        result_1: Math.round(Math.max(close[last_idx] * 1.05, bb_upper)),
        result_2: result_2_series[last_idx] > 0 ? Math.round(getRealisticTarget(result_2_series[last_idx], 0.04)) : null,
        result_3: result_3_series[last_idx] > 0 ? Math.round(getRealisticTarget(result_3_series[last_idx], 0.08)) : null,
        stop_loss: result_3_series[last_idx] > 0 ? Math.round(getRealisticTarget(result_3_series[last_idx], 0.08) * 0.97) : null,
        cond_up7, DHH2: isSignalActive, progress: Number(progress.toFixed(3)), signal_HH, adx: currentADX,
        category, style_tag: (currentADX > 30 ? "단기 추세" : "스윙"),
        current_price: close[last_idx], // [v9.2.1] Explicit price carrier
        target_price_1: Math.round(Math.max(bb_upper, close[last_idx] * 1.05)),
        target_price_2: Math.round(close[last_idx] * 1.12),
        bbw: Number(currentBBW.val.toFixed(4)),
        lowest_bbw_5: Number(currentBBW.low5.toFixed(4)),
        signal_H, signal_HHH,
        is_strong_signal: signal_HHH, // [TASK-A01] 신호 덮어쓰기 방지를 위해 마지막에 선언
        bonus_score, kis_change_data: ohlcHistory.kis_change_data || null
    };
}

// ─────────────────────────────────────────────────────────────────────────
// [CLI Entry Point] Handle standalone execution
// ─────────────────────────────────────────────────────────────────────────
if (require.main === module) {
    (async function runCliSync() {
        try {
            const timeframes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['1D', '2H', '1H', '30M'];
            let kisToken = await getKisAccessToken();
            let stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));
            if (process.env.STOCK_FILTER) {
                const codes = process.env.STOCK_FILTER.split(',').map(s => s.trim());
                stocks = stocks.filter(s => codes.includes(s.code));
            }
            
            const allSignalsMap = new Map();
            const kisCache = {};

            for (const tf of timeframes) {
                // [TASK-A07] 주요 타임프레임(4H, 2D, 1W) 누락 보완
                const intervalMap = { 
                    '30M': '30m', '1H': '1h', '2H': '1h', '4H': '1h', 
                    '1D': '1d', '2D': '1d', '1W': '1wk' 
                };
                const interval = intervalMap[tf] || '1d';
                console.log(`[Analyzer CLI] Syncing ${tf}...`);

                for (let i = 0; i < stocks.length; i++) {
                    const stock = stocks[i];
                    try {
                        // [TASK-A02] 타임프레임별 데이터 일수 최적화 (1D 등 지표 신뢰도 확보)
                        const daysMap = { '30M': 30, '1H': 60, '2H': 90, '4H': 120, '1D': 365, '2D': 730, '1W': 1000 };
                        const days = daysMap[tf] || 90;
                        const rawHistory = await fetchHybridHistory(stock, days, interval, kisToken, kisCache);
                        if (rawHistory && rawHistory.close && rawHistory.close.length > 40) {
                            const signal = calculateSignals(rawHistory, tf);
                            if (signal) {
                                if (!allSignalsMap.has(stock.code)) allSignalsMap.set(stock.code, new Map());
                                allSignalsMap.get(stock.code).set(tf, signal);
                            }
                        }
                    } catch (e) { console.error(`[Analyzer CLI] Error ${stock.code}: ${e.message}`); }
                }
            }

            console.log(`[SSOT] Executing final aggregate sync to DB...`);
            const flatSignals = []; // For ADDITIVE_SAVE
            for (const [code, tfMap] of allSignalsMap) {
                const sig1D = tfMap.get('1D');
                const stockSignals = [];
                for (const [tf, sig] of tfMap) {
                    stockSignals.push({ ...sig, code, timeframe: tf });
                    flatSignals.push({ ...sig, code, timeframe: tf, timestamp: Date.now(), id: uuidv4() });
                }
                
                if (!sig1D) continue;
                
                const stock = stocks.find(s => s.code === code);
                const kisData = sig1D.kis_change_data;
                const scoreRes = ScoringService.calculateTotalScore(Object.fromEntries(tfMap), { current_price: sig1D.current_price, kis_change_data: kisData });
                const strategyObj = ScoringService.generateTradingStrategy(scoreRes.totalScore, tfMap.get('2H') || sig1D, sig1D);

                const indicators = {
                    name: stock.name,
                    currentPrice: sig1D.current_price,
                    changeRate: kisData?.rate || 0,
                    tradeAmount: kisData?.acml_vol || 0,
                    trendType: sig1D.category,
                    trendStrength: String(sig1D.adx || 0),
                    starGrade: String(scoreRes.starGrade),
                    score: scoreRes.totalScore,
                    strategyDay: strategyObj.strategy_day,
                    strategySwing: strategyObj.strategy_swing,
                    entryPrice1: Math.round(sig1D.current_price * (scoreRes.totalScore >= 80 ? 0.995 : 0.98)),
                    entryPrice2: Math.round(sig1D.current_price * 0.95),
                    stopLoss: Math.round(sig1D.current_price * 0.92),
                    targetPrice1: sig1D.result_1,
                    targetPrice2: sig1D.target_price_2,
                    volRate: kisData?.vol_rate || 0,
                    styleTag: sig1D.style_tag || '분석완료',
                    aiComment: strategyObj.strategy_day || '',
                    foreignBuy: kisData?.foreign_buy || 0,
                    instBuy: kisData?.inst_buy || 0
                };

                await signalReportService.upsertSignalReport(code, indicators);
                // [TASK-A11] Top 5 임계값 80점 상향 (server.cjs와 일치)
                if (scoreRes.totalScore >= 80) {
                    await signalReportService.saveDailyTop5(code, indicators);
                }
            }

            // [TASK-S08] ADDITIVE_SAVE: Merge signals into signals.json
            if (process.env.ADDITIVE_SAVE === 'true' && flatSignals.length > 0) {
                console.log(`[ADDITIVE_SAVE] Merging ${flatSignals.length} signals into ${SIGNALS_FILE}...`);
                try {
                    let currentSignals = [];
                    if (fs.existsSync(SIGNALS_FILE)) {
                        currentSignals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
                    }
                    
                    const newKeys = new Set(flatSignals.map(s => `${s.code}_${s.timeframe}`));
                    const filtered = currentSignals.filter(s => !newKeys.has(`${s.code}_${s.timeframe}`));
                    const merged = [...filtered, ...flatSignals];
                    
                    // Atomic Store
                    const tempPath = SIGNALS_FILE + '.tmp';
                    fs.writeFileSync(tempPath, JSON.stringify(merged, null, 2));
                    if (fs.existsSync(SIGNALS_FILE)) fs.unlinkSync(SIGNALS_FILE); // Ensure overwrite on Windows if rename fails
                    fs.renameSync(tempPath, SIGNALS_FILE);
                    console.log(`[ADDITIVE_SAVE] Successfully merged signals.`);
                } catch (saveErr) {
                    console.error(`[ADDITIVE_SAVE] Error:`, saveErr.message);
                }
            }

            console.log(`[Analyzer CLI] Sync completed.`);
            process.exit(0);
        } catch (e) { console.error(e); process.exit(1); }
    })();
}

module.exports = { getKisAccessToken, fetchHybridHistory, calculateSignals };
