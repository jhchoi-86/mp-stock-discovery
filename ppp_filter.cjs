'use strict';

const { PrismaClient } = require('@prisma/client');
const { 
    resampleChartData, 
    fetchHybridHistory, 
    getKisAccessToken 
} = require('./analyzer.cjs');
const { sendMessage: sendTelegram } = require('./src/services/telegramService.cjs');
const redis = require('./platform/infra/redis/client.cjs');
const axios = require('axios');

const prisma = new PrismaClient();

/**
 * KST 기준 YYYY-MM-DD 반환
 * [C1 반영] UTC toISOString() 직접 사용 시 날짜 오차 방지
 */
function getKSTDateString() {
    const now = new Date();
    // UTC에 9시간 더하기
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ──────────────────────────────────────────────────────────────────
// [v9.7.9] TASK-03 확정 멀티 타임프레임 및 데이터 소스 정의
// ──────────────────────────────────────────────────────────────────
const ALL_TIMEFRAMES = ['3M', '5M', '30M', '1H', '2H', '4H', '1D', '2D', '1W'];

const KIS_MINUTE_TF = {
    '3M':  3,
    '5M':  5,
    '30M': 30
};

const YAHOO_TF = {
    '1H': '60m',
    '1D': '1d',
    '1W': '1wk'
};

// ──────────────────────────────────────────────────────────────────
// [수학 유틸리티 함수]
// ──────────────────────────────────────────────────────────────────

/**
 * EMA 시계열 반환 (Pine Script ta.ema와 동일)
 */
function calcEMASeries(prices, period) {
    const k = 2 / (period + 1);
    const result = new Array(prices.length).fill(null);
    if (prices.length < period) return result;

    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result[period - 1] = ema;

    for (let i = period; i < prices.length; i++) {
        if (prices[i] === null) {
            result[i] = result[i - 1];
            continue;
        }
        ema = prices[i] * k + (result[i - 1] !== null ? result[i - 1] : ema) * (1 - k);
        result[i] = ema;
    }
    return result;
}

/**
 * 단일 EMA 값 반환 (마지막 값 전용)
 */
function calcEMA(prices, period) {
    const series = calcEMASeries(prices, period);
    return series[series.length - 1];
}

/**
 * STDEV 계산 (표본 표준편차, Pine Script ta.stdev와 동일)
 */
function calcSTDEV(values, period) {
    const validValues = values.slice(-period).filter(v => v !== null);
    if (validValues.length < period) return 0;

    const mean = validValues.reduce((a, b) => a + b, 0) / period;
    const variance = validValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (period - 1);
    return Math.sqrt(variance);
}

/**
 * Wilder's RSI 시계열 (ta.rsi와 동일)
 */
function calcRSISeries(prices, period) {
    const rsi = new Array(prices.length).fill(null);
    if (prices.length <= period) return rsi;

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));

    for (let i = period + 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
        rsi[i] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
    }
    return rsi;
}

/**
 * ta.valuewhen(condition, value, N)
 */
function valueWhen(condArr, valArr, N = 0) {
    const result = new Array(condArr.length).fill(null);
    const occurrences = [];

    for (let i = 0; i < condArr.length; i++) {
        if (condArr[i]) {
            occurrences.push(valArr[i]);
        }
        if (occurrences.length > 0) {
            const idx = occurrences.length - 1 - N;
            result[i] = idx >= 0 ? occurrences[idx] : null;
        }
    }
    return result;
}

function highestSeries(arr, period, offset = 0) {
    return arr.map((_, i) => {
        const end = i - offset;
        const start = end - period + 1;
        if (start < 0) return null;
        const slice = arr.slice(start, end + 1).filter(v => v !== null);
        return slice.length === period ? Math.max(...slice) : null;
    });
}

function lowestSeries(arr, period, offset = 0) {
    return arr.map((_, i) => {
        const end = i - offset;
        const start = end - period + 1;
        if (start < 0) return null;
        const slice = arr.slice(start, end + 1).filter(v => v !== null);
        return slice.length === period ? Math.min(...slice) : null;
    });
}

// ──────────────────────────────────────────────────────────────────
// [코어 분석 로직]
// ──────────────────────────────────────────────────────────────────

/**
 * BBMacd MTF 계산
 * [RT-5 반영] Warmup: 최소 100봉 이상 권장
 */
function calcBBMacdMTF(closeMTF, params = {}) {
    const { rapida = 12, lenta = 39, stdv = 0.4, signalPeriod = 9 } = params;

    if (closeMTF.length < lenta) return { bbmacd: null, bgUp: false };

    const emaSeries_rapida = calcEMASeries(closeMTF, rapida);
    const emaSeries_lenta = calcEMASeries(closeMTF, lenta);

    const bbmacdSeries = closeMTF.map((_, i) => {
        if (emaSeries_rapida[i] === null || emaSeries_lenta[i] === null) return null;
        return emaSeries_rapida[i] - emaSeries_lenta[i];
    });

    const validBbmacd = bbmacdSeries.filter(v => v !== null);
    if (validBbmacd.length < signalPeriod) return { bbmacd: null, bgUp: false };

    const bbmacd = validBbmacd[validBbmacd.length - 1];
    const avg = calcEMA(validBbmacd, signalPeriod);
    const sdev = calcSTDEV(validBbmacd, signalPeriod);
    const bandaSupe = avg + stdv * sdev;
    const bgUp = bbmacd > bandaSupe && bbmacd > 0;

    return { bbmacd, avg, sdev, bandaSupe, bgUp };
}

/**
 * [v9.7.9] KIS API 직접 수집 (분봉 차트)
 */
async function kisGetMinuteCandles(code, minute, count = 200) {
    try {
        const token = await getKisAccessToken();
        const url = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice';
        
        const res = await axios.get(url, {
            headers: { 
                'content-type': 'application/json',
                'authorization': 'Bearer ' + token, 
                'appkey': process.env.KIS_APP_KEY, 
                'appsecret': process.env.KIS_APP_SECRET, 
                'tr_id': 'FHKST03010200', 
                'custtype': 'P' 
            },
            params: {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": code,
                "FID_ETC_CLS_CODE": "",
                "FID_PW_DATA_INCU_YN": "Y",
                "FID_HOUR_CLS_CODE": String(minute)
            }
        });

        const output2 = res.data.output2;
        if (!output2 || output2.length < 20) return null;

        const reversed = [...output2].reverse();
        return {
            open: reversed.map(d => parseInt(d.stck_oprc)),
            high: reversed.map(d => parseInt(d.stck_hgpr)),
            low: reversed.map(d => parseInt(d.stck_lwpr)),
            close: reversed.map(d => parseInt(d.stck_prpr)),
            volume: reversed.map(d => parseInt(d.cntg_vol)),
            time: reversed.map(d => d.stck_bsop_date + d.stck_cntg_hour)
        };
    } catch (e) {
        console.error(`[KIS Minute] ${code} ${minute}M 실패:`, e.message);
        return null;
    }
}

/**
 * [v9.7.9] 데이터 수집 전략 3원화 (KIS / Yahoo / 리샘플링)
 */
async function fetchCandlesAllTF(stock) {
    const code = stock.code;
    try {
        const kisToken = await getKisAccessToken();

        // 1. KIS 직접 수집 (3M, 5M, 30M)
        const raw3M  = await kisGetMinuteCandles(code, 3);
        const raw5M  = await kisGetMinuteCandles(code, 5);
        const raw30M = await kisGetMinuteCandles(code, 30);

        // 2. Yahoo Finance 수집 (1H, 1D, 1W)
        const raw1H = await fetchHybridHistory(stock, 40,   '60m', kisToken);
        const raw1D = await fetchHybridHistory(stock, 365,  '1d',  kisToken);
        const raw1W = await fetchHybridHistory(stock, 1000, '1wk', kisToken);

        // 3. 리샘플링 (2H / 4H / 2D)
        const raw2H = raw1H ? resampleChartData(raw1H, 2, '2H') : null;
        const raw4H = raw1H ? resampleChartData(raw1H, 4, '4H') : null;
        const raw2D = raw1D ? resampleChartData(raw1D, 2, '2D') : null;

        const MIN_CANDLES = {
            '3M':  100,
            '5M':  100,
            '30M': 100,
            '1H':  100,
            '2H':   50,
            '4H':   25,
            '1D':  100,
            '2D':   50,
            '1W':   20
        };

        const candleMap = {
            '3M': raw3M,  '5M': raw5M,  '30M': raw30M,
            '1H': raw1H,  '2H': raw2H,  '4H': raw4H,
            '1D': raw1D,  '2D': raw2D,  '1W': raw1W
        };

        const result = {};
        for (const [tf, candles] of Object.entries(candleMap)) {
            const minReq = MIN_CANDLES[tf] || 50;
            if (candles && candles.close && candles.close.length >= minReq) {
                result[tf] = candles;
            } else {
                console.warn(`[PPP] ${code} ${tf} 봉 부족(${candles?.close?.length || 0}/${minReq}) - 스킵`);
                result[tf] = null;
            }
        }
        return result;
    } catch (e) {
        console.error(`[PPP] ${code} 캔들 수집 오류:`, e.message);
        return null;
    }
}

/**
 * PPP 필터 주 로직
 * [RT-8 반영] look-ahead 방지를 위한 offset=1 적용
 */
function calcPPP(candles, bgUp, params = {}) {
    const {
        rsiPeriod = 3,
        sto1 = 25, sto2 = 10, sto3 = 10,
        basisUp = 20, basisDown = 80,
        periodLength = 12
    } = params;

    const { close, high, low, open } = candles;
    const len = close.length;
    if (len < sto1 + sto2 + sto3) return { ppp1: false, ppp2: false };

    // 1. RSI
    const rsiSeries = calcRSISeries(close, rsiPeriod);

    // 2. Stochastic
    const kSeries = close.map((_, i) => {
        if (i < sto1 - 1) return null;
        const slice_h = high.slice(i - sto1 + 1, i + 1);
        const slice_l = low.slice(i - sto1 + 1, i + 1);
        const hh = Math.max(...slice_h);
        const ll = Math.min(...slice_l);
        return hh === ll ? 50 : ((close[i] - ll) / (hh - ll)) * 100;
    });

    const dSeries = kSeries.map((_, i) => {
        if (i < sto2 - 1) return null;
        const slice = kSeries.slice(i - sto2 + 1, i + 1).filter(v => v !== null);
        return slice.length === sto2 ? slice.reduce((a, b) => a + b, 0) / sto2 : null;
    });

    const fSeries = calcEMASeries(kSeries.filter(v => v !== null), sto3);

    // 3. Peaks (바 확정 기준 대응: 마지막 봉 제외) - M2, P2
    const M2 = rsiSeries.map((v, i) => {
        if (i < 2 || i === len - 1) return false;
        return rsiSeries[i-2] < rsiSeries[i-1] && rsiSeries[i-1] > v;
    });
    const P2 = rsiSeries.map((v, i) => {
        if (i < 2 || i === len - 1) return false;
        return rsiSeries[i-2] > rsiSeries[i-1] && rsiSeries[i-1] < v;
    });

    // 4. Highest/Lowest (offset=1)
    const highestHigh3 = highestSeries(high, rsiPeriod, 1);
    const lowestLow3 = lowestSeries(low, rsiPeriod, 1);

    // 5. G-Buy & G-Sell (TF)
    const pLowSeries = lowestSeries(low, periodLength, 1);
    const pHighSeries = highestSeries(high, periodLength, 1);

    const condBuy = kSeries.map((k, i) => {
        if (k === null || fSeries[i] === null || i === 0) return false;
        return (kSeries[i - 1] <= basisUp && k > basisUp) && 
               fSeries[i] <= k && open[i] < close[i];
    });

    const condSell = kSeries.map((k, i) => {
        if (k === null || fSeries[i] === null || i === 0) return false;
        return (kSeries[i - 1] >= basisDown && k < basisDown) &&
               fSeries[i] >= k && open[i] > close[i];
    });

    const gBuySeries = valueWhen(condBuy, pLowSeries);
    const gSellSeries = valueWhen(condSell, pHighSeries);

    const B2up = valueWhen(P2, lowestLow3).map((v, i, arr) => i > 0 && arr[i-1] !== null && v !== null && arr[i-1] < v);
    const Q2 = valueWhen(B2up, lowestSeries(low, rsiPeriod, 1));
    const QQ2 = valueWhen(B2up, lowestSeries(low, rsiPeriod, 1), 1);

    const result2series = Q2.map((q, i) => {
        if (q === null || QQ2[i] === null) return null;
        return q > QQ2[i] ? q : QQ2[i];
    });

    // 6. Final Evaluation
    const last = len - 1;
    const currentGBuy = gBuySeries[last];
    const currentGSell = gSellSeries[last];
    const currentResult2 = result2series[last];
    const currentMid = (high[last] + low[last]) / 2;

    const ppp1 = currentGBuy !== null && currentMid > currentGBuy && bgUp;
    const ppp2 = ppp1 && close[last] > currentGBuy && currentResult2 !== null && currentResult2 >= currentGBuy;

    return {
        ppp1, ppp2, 
        gBuy: currentGBuy, 
        gSell: currentGSell,
        result2: currentResult2,
        bgUp
    };
}

/**
 * [v9.7.9] 멀티 TF 스캔 (9개 타임프레임 순회)
 * [C2] matchedTfValues 수집 포함
 */
async function calcPPPAllTF(stock, candlesMTF) {
    let matchedTfs = [];
    let tfValues = {};
    let finalPpp1 = false;
    let finalPpp2 = false;
    let mainGSell = null;

    for (const tf of ALL_TIMEFRAMES) {
        if (!candlesMTF[tf]) continue;

        // BBMacd bgUp 필터 (2H/240 추천하나 지시서에 따라 해당 TF 기준)
        const mtf = calcBBMacdMTF(candlesMTF[tf].close);
        const res = calcPPP(candlesMTF[tf], mtf.bgUp);

        if (res.ppp1 || res.ppp2) {
            matchedTfs.push(tf);
            tfValues[tf] = {
                gSell: res.gSell ? Math.round(res.gSell) : null,
                result2: res.result2 ? Math.round(res.result2) : null
            };
            if (res.ppp1) finalPpp1 = true;
            if (res.ppp2) finalPpp2 = true;
            
            // 대표 gSell은 가장 큰 TF(또는 첫 번째) 우선
            if (!mainGSell) mainGSell = res.gSell;
        }
    }

    return {
        ppp1: finalPpp1,
        ppp2: finalPpp2,
        g_sell: mainGSell,
        matched_tfs: JSON.stringify(matchedTfs),
        tf_values: JSON.stringify(tfValues)
    };
}

/**
 * 단일 종목 멀티 TF PPP 분석 래퍼
 */
async function calcPPPForStock(stock) {
    try {
        const candlesMTF = await fetchCandlesAllTF(stock);
        if (!candlesMTF || Object.keys(candlesMTF).length === 0) return null;

        const allTfRes = await calcPPPAllTF(stock, candlesMTF);
        
        // 현재가 마지막 봉 기준 추출
        const lastTf = Object.keys(candlesMTF)[0];
        const currentPrice = candlesMTF[lastTf].close[candlesMTF[lastTf].close.length - 1];

        return {
            code:           stock.code,
            name:           stock.name,
            score:          stock.score,
            ppp1:           allTfRes.ppp1,
            ppp2:           allTfRes.ppp2,
            g_sell:         allTfRes.g_sell,
            matched_tfs:    allTfRes.matched_tfs,
            tf_values:      allTfRes.tf_values,
            current_price:  currentPrice
        };
    } catch (e) {
        console.error(`[PPP Filter] ${stock.code} 분석 실패:`, e.message);
        return null;
    }
}

async function getActiveWatchlistCodes() {
    const now = new Date();
    const active = await prisma.pppWatchlist.findMany({
        where: { is_active: true, expires_at: { gt: now } },
        select: { code: true }
    });
    return new Set(active.map(r => r.code));
}

/**
 * PPP 스캔 엔진 실행
 */
async function runPppScan() {
    const LOCK_KEY = 'lock:ppp_scan';
    const lockAcquired = await redis.set(LOCK_KEY, '1', 'EX', 600, 'NX'); // 10 min TTL
    if (!lockAcquired) {
        console.warn('[PPP Scan] Another scan is already in progress. Aborting.');
        throw new Error('PPP 분석이 이미 실행 중입니다.');
    }

    try {
        console.log('[PPP Scan] 시작...');
        
        // [1] 최근 24시간 내 동기화된 고득점 종목 추출 (데이터 팽창 방지 및 350개 풀 복구)
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const allSnapshots = await prisma.dailyStockSnapshot.findMany({
            where: { 
                syncDate: { gte: dayAgo },
                hybridScore: { gte: 70 } 
            },
            orderBy: { syncDate: 'desc' }
        });

        // [2] 종목별 중복 제거 (여러 번 동기화된 경우 최신 점수 기준)
        const uniqueMap = new Map();
        for (const s of allSnapshots) {
            if (!uniqueMap.has(s.ticker)) {
                uniqueMap.set(s.ticker, s);
            }
        }
        const allStocks = Array.from(uniqueMap.values());

        if (allStocks.length === 0) {
            console.log('[PPP Scan] 최근 24시간 내 대상 종목 없음 (70점↑)');
            await redis.set('mp:ppp_scan_progress', JSON.stringify({ status: 'idle', processed: 0, total: 0, percentage: 0 }));
            return { added: 0, skipped: 0, total: 0 };
        }

        console.log(`[PPP Scan] 최근 24시간 분석 결과(${allStocks.length}종목) 기반 정밀 스캔 중...`);

        // Initialize progress
        await redis.set('mp:ppp_scan_progress', JSON.stringify({ 
            status: 'scanning', 
            processed: 0, 
            total: allStocks.length, 
            percentage: 0 
        }), 'EX', 3600);

        // [2] 모니터링 중 코드
        const activeCodes = await getActiveWatchlistCodes();

        // [2.5] 마켓 정보 매핑 (Yahoo Finance suffix 결정용)
        const instruments = await prisma.instrument.findMany({
            where: { symbol: { in: allStocks.map(s => s.ticker) } },
            select: { symbol: true, market: true }
        });
        const marketMap = new Map(instruments.map(i => [i.symbol, i.market]));

        // [3] 배치 처리 [RT-1]
        const BATCH_SIZE = 3;
        const BASE_DELAY = 200;
        const results = [];

        for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
            const batch = allStocks.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map(s => calcPPPForStock({ 
                    code: s.ticker, 
                    name: s.name, 
                    score: s.hybridScore,
                    market: marketMap.get(s.ticker) || 'KOSPI'
                }))
            );
            results.push(...batchResults.filter(Boolean));

            // Update Progress in Redis
            const processedCount = Math.min(i + BATCH_SIZE, allStocks.length);
            const percentage = Math.floor((processedCount / allStocks.length) * 100);
            await redis.set('mp:ppp_scan_progress', JSON.stringify({
                status: 'scanning',
                processed: processedCount,
                total: allStocks.length,
                percentage
            }), 'EX', 3600);

            if (i + BATCH_SIZE < allStocks.length) {
                const jitter = Math.floor(Math.random() * 200);
                await new Promise(r => setTimeout(r, BASE_DELAY + jitter));
            }

            // memory management [RT-7]
            if (global.gc) global.gc();
        }

        // [4, 5, 6] 필터 및 저장
        const pppPassed = results.filter(r => r.ppp1 || r.ppp2);
        const newStocks = pppPassed.filter(r => !activeCodes.has(r.code));

        let added = 0;
        const todayStr = getKSTDateString();

        for (const stock of newStocks) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);
            const initSignal = stock.ppp2 ? 'PPP2' : 'PPP1';

            try {
                await prisma.pppWatchlist.create({
                    data: {
                        code:            stock.code,
                        name:            stock.name,
                        score:           stock.score,
                        ppp1:            stock.ppp1,
                        ppp2:            stock.ppp2,
                        g_sell:          stock.g_sell,
                        matched_tfs:     stock.matched_tfs,
                        tf_values:       stock.tf_values,
                        current_price:   stock.current_price,
                        price_updated_at: new Date(),
                        registered_date: todayStr,
                        expires_at:      expiresAt,
                        last_signal:     initSignal,
                        last_signal_changed: new Date()
                    }
                });
                added++;
            } catch (e) {
                // P2002: Unique constraint failed
                if (e.code !== 'P2002') {
                    console.error(`[PPP Scan] DB 저장 오류(${stock.code}):`, e.message);
                }
            }
        }

        console.log(`[PPP Scan] 완료 (추가: ${added}, 스킵: ${pppPassed.length - added})`);
        return { added, skipped: pppPassed.length - added, total: pppPassed.length };
    } catch (e) {
        console.error('[PPP Scan Error]', e);
        throw e;
    } finally {
        await redis.set('mp:ppp_scan_progress', JSON.stringify({ status: 'idle', processed: 0, total: 0, percentage: 0 }));
        await redis.del(LOCK_KEY);
    }
}

/**
 * 신호 상태 변화 체크 및 알림
 */
async function checkSignalChanges() {
    console.log('[PPP Signal] 변화 체크 시작...');
    const now = new Date();
    const activeItems = await prisma.pppWatchlist.findMany({
        where: { is_active: true, expires_at: { gt: now } }
    });

    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    for (const item of activeItems) {
        const current = await calcPPPForStock({ code: item.code, name: item.name, score: item.score });
        if (!current) continue;

        const prevSignal = item.last_signal;
        const newSignal = current.ppp2 ? 'PPP2' : (current.ppp1 ? 'PPP1' : 'NONE');

        if (prevSignal !== newSignal) {
            let message = null;
            if (prevSignal === 'PPP2' && newSignal === 'PPP1') {
                message = `🟡 [${item.name}(${item.code})] PPP2 신호 소멸 → PPP1 유지\n점수: ${item.score}점`;
            } else if (prevSignal === 'PPP1' && newSignal === 'NONE') {
                message = `🔴 [${item.name}(${item.code})] PPP1 신호 소멸 — 모니터링 주의\n점수: ${item.score}점`;
            } else if (prevSignal === 'PPP1' && newSignal === 'PPP2') {
                message = `🟢 [${item.name}(${item.code})] PPP2 강신호 전환\n점수: ${item.score}점`;
            }

            if (message && TELEGRAM_CHAT_ID) {
                const ids = TELEGRAM_CHAT_ID.split(',').map(id => id.trim());
                for (const id of ids) {
                    await sendTelegram(id, message);
                }
                await prisma.pppWatchlist.update({
                    where: { id: item.id },
                    data: { last_signal: newSignal, last_signal_changed: new Date() }
                });
            }
        }

        // 만료 3일 전 알림
        const daysLeft = Math.ceil((item.expires_at - now) / 86400000);
        if (daysLeft === 3 && TELEGRAM_CHAT_ID) {
            await sendTelegram(TELEGRAM_CHAT_ID, `⏰ [${item.name}(${item.code})] 모니터링 만료 3일 전\n등록일: ${item.registered_at.toLocaleDateString('ko-KR')}`);
        }
    }
    console.log('[PPP Signal] 변화 체크 완료.');
}

/**
 * [TASK-03] 현재가 실시간 갱신 (KIS API)
 */
async function updateCurrentPrices() {
    console.log('[PPP Price] 현재가 갱신 시작...');
    const now = new Date();
    const activeItems = await prisma.pppWatchlist.findMany({
        where: { is_active: true, expires_at: { gt: now } }
    });

    const kisToken = await getKisAccessToken();

    for (const item of activeItems) {
        try {
            // 최근 5일치 일봉 데이터를 가져와서 마지막 가격(현재가) 추출
            const data = await fetchHybridHistory(item, 5, '1d', kisToken);
            if (data && data.close && data.close.length > 0) {
                const current = data.close[data.close.length - 1];
                await prisma.pppWatchlist.update({
                    where: { id: item.id },
                    data: { 
                        current_price: current, 
                        price_updated_at: new Date() 
                    }
                });
            }
        } catch (e) {
            console.warn(`[PPP Price] ${item.code} 갱신 실패:`, e.message);
        }
    }
    console.log('[PPP Price] 현재가 갱신 종료.');
}

module.exports = { 
    runPppScan, 
    checkSignalChanges, 
    calcPPPForStock,
    updateCurrentPrices
};
