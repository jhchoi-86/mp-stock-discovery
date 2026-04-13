const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────
// [OPT-01/07] KIS 공유 캐시 사전 수집 함수
// ─────────────────────────────────────────────────
async function prefetchKisCache(stocks, kisToken, config, onProgress = null) {
    if (!kisToken) return {};
    
    const { KIS_APP_KEY, KIS_APP_SECRET, kisCircuit, sleep } = config;
    const BATCH_SIZE = parseInt(config.KIS_PREFETCH_BATCH_SIZE || '3');
    const BATCH_DELAY_MS = parseInt(config.KIS_PREFETCH_BATCH_DELAY_MS || '600');
    const kisSharedCache = {};
    let successCount = 0;
    let failCount = 0;

    console.log(`[KIS-Prefetch] Starting cache prefetch for ${stocks.length} stocks...`);
    
    // [OPT-01] 초기 진행률 발송 (0%)
    if (onProgress) onProgress(0, stocks.length, 'KIS 데이터 수집 준비');

    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (stock) => {
            try {
                // 현재가 조회
                const priceRes = await axios.get(
                    'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price',
                    {
                        headers: {
                            'authorization': 'Bearer ' + kisToken,
                            'appkey': KIS_APP_KEY,
                            'appsecret': KIS_APP_SECRET,
                            'tr_id': 'FHKST01010100'
                        },
                        params: { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: stock.code },
                        timeout: 5000
                    }
                );
                const priceData = priceRes.data.output;

                // 투자자 동향 조회
                let foreignBuy = 0, instBuy = 0, personBuy = 0;
                try {
                    const invRes = await axios.get(
                        'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor',
                        {
                            headers: {
                                'authorization': 'Bearer ' + kisToken,
                                'appkey': KIS_APP_KEY,
                                'appsecret': KIS_APP_SECRET,
                                'tr_id': 'FHKST01010900'
                            },
                            params: { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: stock.code },
                            timeout: 3000
                        }
                    );
                    const out = invRes.data.output;
                    const row = Array.isArray(out) ? out[0] : out;
                    if (row) {
                        foreignBuy = parseInt(row.frgn_ntby_qty || 0) || 0;
                        instBuy    = parseInt(row.orgn_ntby_qty || 0) || 0;
                        personBuy  = parseInt(row.prsn_ntby_qty || 0) || 0;
                    }
                } catch (invErr) {
                    if (invErr.response?.status === 429 && kisCircuit) {
                        kisCircuit.bypass = true;
                        kisCircuit.bypassUntil = Date.now() + (10 * 60 * 1000);
                        if (config.saveCircuitState) config.saveCircuitState();
                        console.error('[KIS-Prefetch] Investor API 429 - circuit open');
                    }
                }

                kisSharedCache[stock.code] = {
                    price: priceData,
                    foreign_buy: foreignBuy,
                    inst_buy: instBuy,
                    person_buy: personBuy,
                    fetchedAt: Date.now()
                };
                successCount++;

            } catch (e) {
                if (e.response?.data?.msg_cd === 'EGW00123') {
                    throw { type: 'TOKEN_EXPIRED', originalError: e };
                }
                failCount++;
                kisSharedCache[stock.code] = null;
            }
        }));

        const currentCount = Math.min(i + BATCH_SIZE, stocks.length);
        
        // [OPT-01] 매 배치마다 혹은 일정 간격으로 진행률 업데이트
        if (onProgress && (currentCount % 10 === 0 || currentCount === stocks.length)) {
            onProgress(currentCount, stocks.length, 'KIS 데이터 수집 중');
        }

        if (currentCount % 30 === 0) {
            console.log(`[KIS-Prefetch] ${currentCount}/${stocks.length} stocks cached...`);
        }

        if (i + BATCH_SIZE < stocks.length && sleep) {
            await sleep(BATCH_DELAY_MS);
        }
    }

    console.log(`[KIS-Prefetch] Complete. Success: ${successCount}, Failed: ${failCount}`);
    return kisSharedCache;
}

module.exports = { prefetchKisCache };
