'use strict';

const { PrismaClient } = require('@prisma/client');
const { 
    resampleChartData, 
    fetchHybridHistory, 
    getKisAccessToken 
} = require('./analyzer.cjs');
const { sendMessage: sendTelegram } = require('./src/services/telegramService.cjs');
const redis = require('./platform/infra/redis/client.cjs');

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
 * KIS API를 통한 멀티 TF 데이터 수집
 * [RT-2 반영] 2H/2D는 리샘플링 사용
 */
async function fetchCandlesMultiTF(code) {
    try {
        const kisToken = await getKisAccessToken();
        const stockObj = { code }; // fetchHybridHistory 기대 형식

        // 1H 데이터 (2H를 만들기 위해 수집)
        // [RT-5] Warmup 확보 위해 200봉 요청
        const raw1H = await fetchHybridHistory(stockObj, 60, '1h', kisToken);
        if (!raw1H || !raw1H.close || raw1H.close.length < 100) return null;

        // 2H 리샘플링 [RT-2]
        const raw2H = resampleChartData(raw1H, 2, '2H');

        return { 
            '1H': raw1H, 
            '2H': raw2H 
        };
    } catch (e) {
        console.error(`[PPP Filter] API 호출 오류(${code}):`, e.message);
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

    // 5. G-Buy & Result_2
    const pLowSeries = lowestSeries(low, periodLength, 1);
    const condBuy = kSeries.map((k, i) => {
        if (k === null || fSeries[i] === null || i === 0) return false;
        return (kSeries[i - 1] <= basisUp && k > basisUp) && 
               fSeries[i] <= k && open[i] < close[i];
    });

    const gBuySeries = valueWhen(condBuy, pLowSeries);

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
    const currentResult2 = result2series[last];
    const currentMid = (high[last] + low[last]) / 2;

    const ppp1 = currentGBuy !== null && currentMid > currentGBuy && bgUp;
    const ppp2 = ppp1 && close[last] > currentGBuy && currentResult2 !== null && currentResult2 >= currentGBuy;

    return {
        ppp1, ppp2, 
        gBuy: currentGBuy, 
        result2: currentResult2,
        bgUp
    };
}

/**
 * 단일 종목 PPP 계산 래퍼
 [H1 반영]
 */
async function calcPPPForStock(stock) {
    try {
        const candles = await fetchCandlesMultiTF(stock.code);
        if (!candles || !candles['1H'] || !candles['2H']) return null;

        const mtfClose = candles['2H'].close;
        const mtf = calcBBMacdMTF(mtfClose);

        const pppResult = calcPPP(candles['1H'], mtf.bgUp);

        return {
            code:    stock.code,
            name:    stock.name,
            score:   stock.score,
            ppp1:    pppResult.ppp1,
            ppp2:    pppResult.ppp2,
            gBuy:    pppResult.gBuy,
            result2: pppResult.result2
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
        
        // [1] 고득점 종목 조회 (70점↑)
        const allStocks = await prisma.dailyStockSnapshot.findMany({
            where: { hybridScore: { gte: 70 } },
            orderBy: { hybridScore: 'desc' }
        });

        if (allStocks.length === 0) {
            console.log('[PPP Scan] 대상 종목 없음 (70점↑)');
            return { added: 0, skipped: 0, total: 0 };
        }

        // [2] 모니터링 중 코드
        const activeCodes = await getActiveWatchlistCodes();

        // [3] 배치 처리 [RT-1]
        const BATCH_SIZE = 3;
        const BASE_DELAY = 200;
        const results = [];

        for (let i = 0; i < allStocks.length; i += BATCH_SIZE) {
            const batch = allStocks.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map(s => calcPPPForStock({ code: s.ticker, name: s.name, score: s.hybridScore }))
            );
            results.push(...batchResults.filter(Boolean));

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
                        g_buy:           stock.gBuy,
                        result_2:        stock.result2,
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

module.exports = { 
    runPppScan, 
    checkSignalChanges, 
    calcPPPForStock 
};
