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
const ALL_TIMEFRAMES = ['30M', '1H', '2H', '1D', '2D', '1W'];

const KIS_MINUTE_TF = {
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
/**
 * EMA 시계열 반환 (Pine Script ta.ema 완전 일치)
 * 초기화: 첫 번째 유효값으로 시작 (SMA 아님)
 */
function calcEMASeries(src, length) {
    const alpha = 2 / (length + 1);
    const result = new Array(src.length).fill(null);
    let ema = null;

    for (let i = 0; i < src.length; i++) {
        if (src[i] === null || src[i] === undefined || isNaN(src[i])) {
            result[i] = ema;
            continue;
        }
        if (ema === null) {
            ema = src[i];
        } else {
            ema = alpha * src[i] + (1 - alpha) * ema;
        }
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
/**
 * Pine Script ta.rma() — Wilder's Smoothing (RSI 내부 사용)
 */
function calcRMASeries(src, length) {
    const alpha = 1 / length;
    const result = new Array(src.length).fill(null);
    let rma = null;
    let sum = 0;
    let count = 0;

    for (let i = 0; i < src.length; i++) {
        if (src[i] === null || src[i] === undefined || isNaN(src[i])) {
            result[i] = rma;
            continue;
        }
        if (rma === null) {
            sum += src[i];
            count++;
            if (count >= length) {
                rma = sum / length;
                result[i] = rma;
            }
        } else {
            rma = alpha * src[i] + (1 - alpha) * rma;
            result[i] = rma;
        }
    }
    return result;
}

/**
 * Pine Script ta.rsi() 완전 구현 (Wilder's RMA 방식)
 */
function calcRSISeries(close, length) {
    const n = close.length;
    const gains = new Array(n).fill(null);
    const losses = new Array(n).fill(null);

    for (let i = 1; i < n; i++) {
        if (close[i] === null || close[i-1] === null) continue;
        const diff = close[i] - close[i - 1];
        gains[i] = diff > 0 ? diff : 0;
        losses[i] = diff < 0 ? -diff : 0;
    }

    const avgGains = calcRMASeries(gains, length);
    const avgLosses = calcRMASeries(losses, length);
    const result = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {
        if (avgGains[i] === null || avgLosses[i] === null) continue;
        if (avgLosses[i] === 0) {
            result[i] = 100;
        } else {
            const rs = avgGains[i] / avgLosses[i];
            result[i] = 100 - (100 / (1 + rs));
        }
    }
    return result;
}

/**
 * ta.valuewhen(condition, value, N)
 */
/**
 * ta.valuewhen(condition, value, N)
 * [v1.2] 배열 길이 검증 및 역방향 탐색 최적화
 */
function valueWhen(condArr, valArr, N = 0) {
    if (condArr.length !== valArr.length) throw new Error('[valueWhen] 배열 길이 불일치');
    const result = new Array(condArr.length).fill(null);
    const occurrences = [];

    for (let i = 0; i < condArr.length; i++) {
        if (condArr[i] === true) {
            occurrences.push(valArr[i]);
        }
        if (occurrences.length > 0) {
            const idx = occurrences.length - 1 - N;
            result[i] = idx >= 0 ? occurrences[idx] : null;
        }
    }
    return result;
}

/**
 * [v1.2] 시리즈 기반 valueWhen (배열 전체 반환이 아닌 특정 시점 계산용 최적화 가능)
 * 기본적으로 valueWhen()은 시계열 배열을 반환함.
 */

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

    const avgSeries = calcEMASeries(bbmacdSeries, signalPeriod);
    const sdevSeries = new Array(closeMTF.length).fill(null);
    for (let i = signalPeriod - 1; i < bbmacdSeries.length; i++) {
        const slice = bbmacdSeries.slice(i - signalPeriod + 1, i + 1).filter(v => v !== null);
        if (slice.length === signalPeriod) {
            const mean = slice.reduce((a, b) => a + b, 0) / signalPeriod;
            const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (signalPeriod); // Pine stddev uses N
            sdevSeries[i] = Math.sqrt(variance);
        }
    }

    const bandaSupeSeries = avgSeries.map((a, i) => (a !== null && sdevSeries[i] !== null) ? a + stdv * sdevSeries[i] : null);
    
    // [C1] bg_up 반드시 배열로 계산 (series bool)
    const bgUpSeries = bbmacdSeries.map((v, i) => (v !== null && bandaSupeSeries[i] !== null && v > bandaSupeSeries[i] && v > 0));

    return { bbmacdSeries, avgSeries, sdevSeries, bandaSupeSeries, bgUpSeries };
}

// [v1.3] kisGetMinuteCandles 삭제 (analyzer.cjs의 fetchHybridHistory가 통합 처리)

/**
 * [v1.3] 데이터 수집 전략 고도화 (Primary/Secondary 전환형)
 */
async function fetchCandlesAllTF(stock) {
    const code = stock.code;
    const candlesMTF = {};
    let kisToken = null;
    try { kisToken = await getKisAccessToken(); } catch (e) {}

    const MIN_CANDLES = {
        '30M': 300,
        '1H':  300,
        '2H':  150,
        '1D':  500,
        '2D':  250,
        '1W':   60
    };

    // [v9.8.2] 최적화: 현재가 1회 조회 후 캐싱 (중복 조회 방지)
    let kisCache = null;
    if (kisToken) {
        try {
            const res = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price', {
                headers: { 'authorization': 'Bearer ' + kisToken, 'appkey': process.env.KIS_APP_KEY, 'appsecret': process.env.KIS_APP_SECRET, 'tr_id': 'FHKST01010100' },
                params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code },
                timeout: 3000
            });
            if (res.data?.output) {
                kisCache = { [code]: { price: res.data.output } };
            }
        } catch (e) {
            console.warn(`[PPP Price Cache] ${code} 조회 실패:`, e.message);
        }
    }

    // [v9.8.2] 최적화: 타임프레임 병렬 수집 (Promise.all)
    const primaryTFs = ['30M', '1H', '1D', '1W'];
    const fetchTasks = primaryTFs.map(async (tf) => {
        try {
            const days = { '30M': 10, '1H': 60, '1D': 730, '1W': 2000 }[tf];
            const interval = { '30M': '30m', '1H': '60m', '1D': '1d', '1W': '1wk' }[tf];
            
            const data = await fetchHybridHistory(stock, days, interval, kisToken, kisCache);

            if (data && data.close && data.close.length >= (MIN_CANDLES[tf] || 50)) {
                return { tf, data };
            }
        } catch (e) {
            console.warn(`[PPP Fetch] ${code} ${tf} 실패:`, e.message);
        }
        return null;
    });

    const results = await Promise.all(fetchTasks);
    results.forEach(res => {
        if (res) candlesMTF[res.tf] = res.data;
    });

    // [v1.3] 리샘플링 루프: 2H(from 1H), 2D(from 1D)
    if (candlesMTF['1H']) candlesMTF['2H'] = resampleChartData(candlesMTF['1H'], 2, '2H');
    if (candlesMTF['1D']) candlesMTF['2D'] = resampleChartData(candlesMTF['1D'], 2, '2D');

    if (Object.keys(candlesMTF).length === 0) return null;
    return candlesMTF;
}

/**
 * PPP 필터 주 로직
 * [RT-8 반영] look-ahead 방지를 위한 offset=1 적용
 */
/**
 * [v1.2] PPP 필터 주 로직 (확정봉 분석 시스템)
 */
function calcPPP(candles, indicators = {}) {
    const { close, high, low, open } = candles;
    const { bgUpSeries = [] } = indicators;
    
    // [v1.2] 확정봉 기준 고정: len-2 (장중 실시간 대응 시 len-1도 가능하지만, 보수적으로 len-2 채택)
    const len = close.length;
    const last = len - 2; 
    
    // [v1.2] Warmup 검증 (최소 50봉 필요)
    if (last < 50) return null;

    const rsiPeriod = 3;
    const sto1 = 25; const sto2 = 10; const sto3 = 10;
    const basisUp = 20; const basisDown = 80;
    const periodLength = 12;

    // 1. RSI (Series)
    const rsiSeries = calcRSISeries(close, rsiPeriod);

    // 2. Stochastic (Series) - [C4] offset=1 적용된 신규 버전 사용
    const kSeries = new Array(len).fill(null);
    for (let i = sto1; i < len; i++) {
        // [C4] i-sto1부터 i-1까지 탐색 (현재 봉 i 제외)
        const hSlice = high.slice(i - sto1, i);
        const lSlice = low.slice(i - sto1, i);
        const hh = Math.max(...hSlice);
        const ll = Math.min(...lSlice);
        if (hh === ll) { kSeries[i] = null; } 
        else { kSeries[i] = 100 * (close[i] - ll) / (hh - ll); }
    }
    const fSeries = calcEMASeries(kSeries, sto3);

    // 3. Peaks (P2) - Series
    const P2 = rsiSeries.map((v, i) => {
        if (i < 2) return false;
        return rsiSeries[i-2] > rsiSeries[i-1] && rsiSeries[i-1] < v;
    });

    // 4. Highest/Lowest (offset=1) - Series
    const lowestLow3 = lowestSeries(low, 3, 1);
    const pHighSeries = highestSeries(high, periodLength, 1);

    // 5. condSell, gSell (Series)
    const condSell = kSeries.map((k, i) => {
        if (k === null || fSeries[i] === null || i === 0) return false;
        return (kSeries[i - 1] >= basisDown && k < basisDown) &&
               fSeries[i] >= k && open[i] > close[i];
    });

    const gSellSeries = valueWhen(condSell, pHighSeries);

    // 6. Support Line (result_2) - Series
    const B2up = valueWhen(P2, lowestLow3).map((v, i, arr) => i > 0 && arr[i-1] !== null && v !== null && arr[i-1] < v);
    const Q2 = valueWhen(B2up, lowestSeries(low, 3, 1));
    const QQ2 = valueWhen(B2up, lowestSeries(low, 3, 1), 1);

    const result2series = Q2.map((q, i) => {
        if (q === null || QQ2[i] === null) return null;
        return q > QQ2[i] ? q : QQ2[i];
    });

    // 7. Scalar Extraction (at 'last' index)
    const mid = (high[last] + low[last]) / 2;
    const gSell = gSellSeries[last];
    const bgUp = bgUpSeries[last];
    const result2 = result2series[last];

    if (gSell === null || bgUp === undefined) return null;

    const ppp1 = mid > gSell && bgUp;
    const ppp2 = ppp1 && result2 !== null && result2 >= gSell;

    return {
        ppp1, ppp2, 
        gSell,
        result2,
        bgUp,
        lastPrice: close[last]
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
    let mainResult2 = null;

    // ──────────────────────────────────────────────────────────────────
    // [v9.7.8-patch] 대표값 선정 전략: 1W -> 2D -> 1D 순으로 데이터가 있으면 우선 채택
    // ──────────────────────────────────────────────────────────────────
    const REPRESENTATIVE_TFS = ['1W', '2D', '1D', '2H', '1H', '30M'];

    for (const tf of ALL_TIMEFRAMES) {
        try {
            if (!candlesMTF[tf]) continue;

            const indicators = calcBBMacdMTF(candlesMTF[tf].close);
            const res = calcPPP(candlesMTF[tf], indicators);

            if (res && (res.ppp1 || res.ppp2)) {
                matchedTfs.push(tf);
                tfValues[tf] = {
                    gSell: res.gSell ? Math.round(res.gSell) : null,
                    result2: res.result2 ? Math.round(res.result2) : null
                };
                if (res.ppp1) finalPpp1 = true;
                if (res.ppp2) finalPpp2 = true;
            }
        } catch (e) {
            console.warn(`[PPP] ${stock.code} ${tf} 분석 에러:`, e.message);
            continue;
        }
    }

    // [v1.2] 최적의 대표값(G-Sell, 지지선) 결정 - 모든 TF 재분석 (리샘플링 무관하게 recalculate)
    for (const tf of REPRESENTATIVE_TFS) {
        if (!candlesMTF[tf]) continue;
        try {
            const indicators = calcBBMacdMTF(candlesMTF[tf].close);
            const res = calcPPP(candlesMTF[tf], indicators);
            if (res && !mainGSell && res.gSell) mainGSell = res.gSell;
            if (res && !mainResult2 && res.result2) mainResult2 = res.result2;
            if (mainGSell && mainResult2) break;
        } catch(e) {}
    }

    return {
        ppp1: finalPpp1,
        ppp2: finalPpp2,
        g_sell: mainGSell,
        result_2: mainResult2, // [FIX] 필드 누락 복구
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
        const tfKeys = Object.keys(candlesMTF);
        if (tfKeys.length === 0) return null;

        const lastTf = tfKeys[0];
        const currentPrice = candlesMTF[lastTf].close[candlesMTF[lastTf].close.length - 1];

        return {
            code:           stock.code,
            name:           stock.name,
            score:          stock.score,
            ppp1:           allTfRes.ppp1,
            ppp2:           allTfRes.ppp2,
            g_sell:         allTfRes.g_sell,
            result_2:       allTfRes.result_2, // [FIX] 지지선 바인딩
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

        // [3] 배치 처리 최적화 (v9.8.2)
        const BATCH_SIZE = 4;
        const BASE_DELAY = 150;
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

        // [4, 5, 6] 필터 및 배치 저장 (v9.8.6)
        const pppPassed = results.filter(r => r.ppp1 || r.ppp2);
        const todayStr = getKSTDateString();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        console.log(`[PPP Scan] 분석 완료 종목: ${pppPassed.length}건. DB Upsert 시작...`);

        // 트런잭션을 통한 배치 업서트 (성능 최적화)
        const upsertTasks = pppPassed.map(stock => {
            const initSignal = stock.ppp2 ? 'PPP2' : 'PPP1';
            return prisma.pppWatchlist.upsert({
                where: { 
                    code_registered_date: {
                        code: stock.code,
                        registered_date: todayStr
                    }
                },
                update: {
                    score:           stock.score,
                    ppp1:            stock.ppp1,
                    ppp2:            stock.ppp2,
                    g_sell:          stock.g_sell,
                    result_2:        stock.result_2,
                    matched_tfs:     JSON.stringify(stock.matched_tfs || []),
                    tf_values:       JSON.stringify(stock.tf_values || {}),
                    current_price:   stock.current_price,
                    price_updated_at: new Date(),
                    is_active:       true, // 재스캔 시 활성화 보장
                    last_signal:     initSignal,
                    updated_at:      new Date()
                },
                create: {
                    code:            stock.code,
                    name:            stock.name,
                    score:           stock.score,
                    ppp1:            stock.ppp1,
                    ppp2:            stock.ppp2,
                    g_sell:          stock.g_sell,
                    result_2:        stock.result_2,
                    matched_tfs:     JSON.stringify(stock.matched_tfs || []),
                    tf_values:       JSON.stringify(stock.tf_values || {}),
                    current_price:   stock.current_price,
                    price_updated_at: new Date(),
                    registered_date: todayStr,
                    expires_at:      expiresAt,
                    is_active:       true,
                    last_signal:     initSignal,
                    last_signal_changed: new Date()
                }
            });
        });

        const results_db = await prisma.$transaction(upsertTasks);
        console.log(`[PPP Scan] DB Upsert 완료: ${results_db.length}건`);

        return { total: pppPassed.length, updated: results_db.length };
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
            // [v9.8.1] Jitter 추가하여 Rate Limit 분산 (100-300ms)
            await new Promise(r => setTimeout(r, 100 + Math.random() * 200));

            // KIS 우선 시도
            let current = null;
            const data = await fetchHybridHistory(item, 5, '1d', kisToken);
            if (data && data.close && data.close.length > 0) {
                current = data.close[data.close.length - 1];
            } else {
                // [v9.8.1] KIS 실패 시 Yahoo Finance Failover
                const yahooData = await fetchHybridHistory(item, 5, '1d', null);
                if (yahooData && yahooData.close && yahooData.close.length > 0) {
                    current = yahooData.close[yahooData.close.length - 1];
                    // console.log(`[PPP Price] ${item.code} Yahoo Failover 성공: ${current}`);
                }
            }

            if (current) {
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
            continue;
        }
    }
    console.log('[PPP Price] 현재가 갱신 종료.');
}

module.exports = { 
    runPppScan, 
    checkSignalChanges, 
    calcPPPForStock,
    calcPPPAllTF,
    updateCurrentPrices,
    // [Testing] Exported for verification
    calcEMASeries,
    calcRSISeries,
    calcRMASeries,
    valueWhen,
    calcPPP
};
