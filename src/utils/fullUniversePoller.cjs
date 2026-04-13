/**
 * fullUniversePoller.cjs - v1.0.0
 * 한투 KIS REST API 초당 20건 제한 준수, 350종목 전체 실시간 현재가 배치 폴러
 *
 * 설계 원칙:
 *  - BATCH_SIZE=18건 병렬 발사 → 1.1초 대기 (초당 20건 한도의 90% 사용, 안전 마진 10%)
 *  - 1순환(19배치) ≈ 약 20초
 *  - 장중(평일 09:00~15:30 KST)에만 실행
 *  - 써킷브레이커: 연속 429 3회 → 5분 차단 → HALF-OPEN 1건 테스트
 *  - 결과: 메모리 캐시 + data/live_prices_full.json (5분마다 flush)
 */

'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── 설정 ────────────────────────────────────────────────────────────────────
const BATCH_SIZE      = 18;          // 배치당 병렬 호출 수 (안전 마진 포함)
const BATCH_DELAY_MS  = 1100;        // 배치 간 딜레이 (ms)
const MAX_RETRIES     = 2;           // 429 재시도 최대 횟수
const FLUSH_INTERVAL  = 5 * 60 * 1000; // 디스크 flush 주기 (5분)
const KST_OFFSET      = 9 * 60 * 60 * 1000;

const KIS_PRICE_URL   = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
const DATA_DIR        = path.join(__dirname, '../../data');
const FULL_PRICE_FILE = path.join(DATA_DIR, 'live_prices_full.json');

// ─── 써킷브레이커 상태 ────────────────────────────────────────────────────────
const circuit = {
    state: 'CLOSED',     // CLOSED | OPEN | HALF_OPEN
    consecutiveErrors: 0,
    openAt: 0,
    OPEN_THRESHOLD: 3,
    RECOVER_MS: 5 * 60 * 1000 // 5분
};

// ─── 인메모리 캐시 ────────────────────────────────────────────────────────────
let IN_MEMORY_CACHE = {};
let lastFlushAt = 0;

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function chunk(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

function getNowKST() {
    return new Date(Date.now() + KST_OFFSET);
}

function isMarketHours() {
    const now = getNowKST();
    const day = now.getUTCDay(); // KST Offset added object's UTCDay is the actual KST Day
    if (day === 0 || day === 6) return false; // 0=Sunday, 6=Saturday

    const h = now.getUTCHours();
    const m = now.getUTCMinutes();
    const t = h * 100 + m;

    // 1. 장전 시간외 종가: 08:30 ~ 08:40
    if (t >= 830 && t <= 840) return true;
    
    // 2. 정규장 + 장후 시간외 + 시간외 단일가 + 연장 마감: 09:00 ~ 20:00
    if (t >= 900 && t <= 2000) return true;

    return false;
}

// ─── KIS API 단건 조회 ────────────────────────────────────────────────────────
async function fetchOnePrice(code, token, apiKey, apiSecret) {
    const res = await axios.get(KIS_PRICE_URL, {
        headers: {
            authorization: `Bearer ${token}`,
            appkey:        apiKey,
            appsecret:     apiSecret,
            tr_id:         'FHKST01010100'
        },
        params: {
            FID_COND_MRKT_DIV_CODE: 'J',
            FID_INPUT_ISCD:         code
        },
        timeout: 4000,
        httpsAgent: new https.Agent({ family: 4 })
    });

    if (res.data?.rt_cd === '1') {
        throw Object.assign(new Error(res.data.msg1 || 'KIS API Error'), { kisCode: res.data.msg_cd });
    }
    return res.data.output;
}

async function fetchPriceWithRetry(code, token, apiKey, apiSecret, retries = 0) {
    try {
        const output = await fetchOnePrice(code, token, apiKey, apiSecret);
        circuit.consecutiveErrors = 0; // 성공 시 초기화
        return output;
    } catch (e) {
        const is429 = e.response?.status === 429 || e.kisCode === 'EGW00201';
        if (is429) circuit.consecutiveErrors++;

        if (is429 && retries < MAX_RETRIES) {
            await sleep(2000 * (retries + 1)); // 지수 백오프
            return fetchPriceWithRetry(code, token, apiKey, apiSecret, retries + 1);
        }
        return null;
    }
}

// ─── 써킷브레이커 관리 ────────────────────────────────────────────────────────
function checkCircuit() {
    if (circuit.state === 'OPEN') {
        if (Date.now() - circuit.openAt >= circuit.RECOVER_MS) {
            circuit.state = 'HALF_OPEN';
            console.log('[FullPoller] Circuit HALF-OPEN: 복구 테스트 시작');
        } else {
            return false; // 아직 차단 중
        }
    }

    if (circuit.consecutiveErrors >= circuit.OPEN_THRESHOLD) {
        circuit.state = 'OPEN';
        circuit.openAt = Date.now();
        console.warn(`[FullPoller] ⚡ Circuit OPEN: 429 ${circuit.consecutiveErrors}회. 5분 차단.`);
        return false;
    }
    return true;
}

function onBatchSuccess() {
    if (circuit.state === 'HALF_OPEN') {
        circuit.state = 'CLOSED';
        circuit.consecutiveErrors = 0;
        console.log('[FullPoller] ✅ Circuit CLOSED: 복구 성공');
    }
}

// ─── 배치 폴 실행 ─────────────────────────────────────────────────────────────
async function runFullUniversePoll(stockMaster, getKisToken, getWssSubscribedCodes = null, onBatchUpdate = null) {
    if (!checkCircuit()) return;

    const API_KEY    = process.env.KIS_APP_KEY;
    const API_SECRET = process.env.KIS_APP_SECRET;

    if (!API_KEY || !API_SECRET) {
        console.error('[FullPoller] KIS API Key 미설정.');
        return;
    }

    let token;
    try {
        token = await getKisToken();
    } catch (e) {
        console.error('[FullPoller] KIS 토큰 발급 실패:', e.message);
        return;
    }

    // [v8.8.17] Safety Fallback: Do not skip WSS stocks. 
    // This ensures that even if WebSocket connection is unstable, priority stocks still update every 5 mins.
    const wssCodes = getWssSubscribedCodes ? getWssSubscribedCodes() : new Set();
    const targetStocks = stockMaster; // Safety: All stocks

    const batches = chunk(targetStocks, BATCH_SIZE);
    const roundResult = { ...IN_MEMORY_CACHE };
    let updatedCount = 0;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];
        const settled = await Promise.allSettled(
            batch.map(s => fetchPriceWithRetry(s.code, token, API_KEY, API_SECRET))
        );

        settled.forEach((r, i) => {
            if (r.status !== 'fulfilled' || !r.value) return;
            const stock = batch[i];
            const output = r.value;
            const currentPrice = parseInt(output.stck_prpr || '0', 10);
            const lowPrice     = parseInt(output.stck_lwpr || '9999999', 10);
            const changeRate   = parseFloat(output.prdy_ctrt || '0');
            const entryPrice   = stock.entry_price || 0;

            const isHit = entryPrice > 0 && (currentPrice <= entryPrice || lowPrice <= entryPrice);
            const prev  = roundResult[stock.code] || {};

            roundResult[stock.code] = {
                price:      currentPrice,
                low:        lowPrice,
                change_rate: changeRate,
                is_hit:     isHit || prev.is_hit || false,
                hit_at:     isHit && !prev.hit_at ? Date.now() : (prev.hit_at || null),
                updated_at: Date.now()
            };
            updatedCount++;
        });

        // [v8.8.13] Batch Update Callback for SSE-Push
        if (onBatchUpdate) {
            const batchSnapshot = {};
            batch.forEach(s => {
                if (roundResult[s.code]) {
                    batchSnapshot[s.code] = {
                        price: roundResult[s.code].price,
                        changeRate: roundResult[s.code].change_rate
                    };
                }
            });
            if (Object.keys(batchSnapshot).length > 0) {
                onBatchUpdate(batchSnapshot);
            }
        }

        onBatchSuccess();
        if (bIdx < batches.length - 1) await sleep(BATCH_DELAY_MS);
    }

    // 메모리 캐시 갱신
    Object.keys(roundResult).forEach(code => {
        const newData = roundResult[code];
        const prev = IN_MEMORY_CACHE[code];
        if (!prev || newData.updated_at >= (prev.updated_at || 0)) {
            IN_MEMORY_CACHE[code] = newData;
        }
    });

    if (Date.now() - lastFlushAt >= FLUSH_INTERVAL) {
        try {
            fs.writeFileSync(FULL_PRICE_FILE, JSON.stringify(IN_MEMORY_CACHE, null, 2));
            lastFlushAt = Date.now();
        } catch (e) {
            console.error('[FullPoller] Flush 실패:', e.message);
        }
    }

    const kst = getNowKST();
    const hhmm = `${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}`;
    console.log(`[FullPoller] Round complete @ KST ${hhmm} — ${updatedCount}/${targetStocks.length}종목 갱신 (WSS Skip: ${wssCodes.size})`);
}

// ─── 공개 인터페이스 ──────────────────────────────────────────────────────────

/** 전체 유니버스 폴러 시작 */
function startFullUniversePoller(stockMaster, getKisToken, getWssSubscribedCodes = null, onBatchUpdate = null) {
    // 디스크 캐시 복원
    try {
        if (fs.existsSync(FULL_PRICE_FILE)) {
            IN_MEMORY_CACHE = JSON.parse(fs.readFileSync(FULL_PRICE_FILE, 'utf8'));
            console.log(`[FullPoller] 캐시 복원: ${Object.keys(IN_MEMORY_CACHE).length}종목`);
        }
    } catch (e) {}

    console.log(`[FullPoller] 초기화 완료 — ${stockMaster.length}종목 / 배치 ${BATCH_SIZE}건 / 딜레이 ${BATCH_DELAY_MS}ms`);

    async function loop() {
        if (isMarketHours()) {
            try {
                await runFullUniversePoll(stockMaster, getKisToken, getWssSubscribedCodes, onBatchUpdate);
            } catch (e) {
                console.error('[FullPoller] Loop Error:', e.message);
            }
        }
        // [v7.8.0 규칙] 1순환 완료 후 정규장은 5분 대기 (기타 모든 종목 5분 단위 일괄 갱신)
        setTimeout(loop, isMarketHours() ? 300000 : 10000);
    }

    loop();
}

/** 실시간 가격 캐시 외부 업데이트 (웹소켓 연동용) */
function updateCachedPrice(code, price, changeRate, stockMaster = []) {
    const prev = IN_MEMORY_CACHE[code] || {};
    
    // 목표가 도달(is_hit) 판정 로직 추가
    let isHit = prev.is_hit || false;
    let hitAt = prev.hit_at || null;
    
    const masterInfo = stockMaster.find(s => s.code === code);
    if (masterInfo && masterInfo.target_price > 0 && !isHit) {
        if (price >= masterInfo.target_price) {
            isHit = true;
            hitAt = Date.now();
            console.log(`[WSS-HIT] ${masterInfo.name} (${code}) 목표가 도달! ${price} >= ${masterInfo.target_price}`);
        }
    }

    IN_MEMORY_CACHE[code] = {
        ...prev,
        price,
        change_rate: changeRate,
        is_hit: isHit,
        hit_at: hitAt,
        updated_at: Date.now()
    };
}

/** 특정 종목의 캐시된 가격 반환 */
function getCachedPrice(code) {
    return IN_MEMORY_CACHE[code] || null;
}

/** 전체 가격 캐시 객체 반환 */
function getFullPriceCache() {
    return IN_MEMORY_CACHE;
}

module.exports = { startFullUniversePoller, getCachedPrice, getFullPriceCache, updateCachedPrice };
