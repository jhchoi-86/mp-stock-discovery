const WebSocket = require('ws');
const axios = require('axios');
require('dotenv').config();

const redis = require('../../platform/infra/redis/client.cjs');

const KIS_WS_URL = 'ws://ops.koreainvestment.com:21000';
const APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();

let ws = null;
let approvalKey = null;
let subscribedCodes = new Set();
let onPriceUpdateCallback = null;

const REDIS_KEY = 'kis:approval_key';

/** KIS API에서 Approval Key 직접 발급 (Helper) */
async function fetchKISApproval() {
    const res = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/Approval', {
        grant_type: 'client_credentials',
        appkey: APP_KEY,
        secretkey: APP_SECRET
    });
    return res.data;
}

/** 웹소켓 접속용 Approval Key 발급 (Redis 공유 적용) */
async function getApprovalKey() {
    // Step 1: Redis 캐시 우선 확인 (장애 시 폴백 포함)
    try {
        const cached = await redis.get(REDIS_KEY);
        if (cached) {
            approvalKey = cached;
            console.log('[KIS-WSS] approval_key Redis 캐시 사용');
            return approvalKey;
        }
    } catch (err) {
        // Redis 장애 시 직접 발급으로 폴백 — 서비스 중단 방지
        console.warn('[KIS-WSS] Redis 조회 실패, 직접 발급으로 폴백:', err.message);
    }

    try {
        // Step 2: KIS API 신규 발급
        const response = await fetchKISApproval();
        const key = response.approval_key;

        // Step 3: TTL은 KIS 응답값 우선, 없으면 6시간(보수적)
        const ttl = response.expires_in || 21600;

        // Step 4: SET NX — Race Condition 방지 (먼저 저장한 쪽만 유효)
        try {
            // Node-Redis는 set(key, value, 'EX', ttl, 'NX') 형식을 지원함
            await redis.set(REDIS_KEY, key, 'EX', ttl, 'NX');
            console.log(`[KIS-WSS] approval_key 신규 발급 → Redis 저장 (TTL: ${ttl}s)`);
        } catch (err) {
            console.warn('[KIS-WSS] Redis 저장 실패 (무시):', err.message);
        }

        approvalKey = key;
        return approvalKey;
    } catch (e) {
        console.error('[KIS-WSS] Approval Key 발급 실패:', e.message);
        return null;
    }
}

/** 실시간 체결가 구독 메시지 생성 */
function createSubMsg(code, isUnsub = false) {
    return JSON.stringify({
        header: {
            approval_key: approvalKey,
            custtype: 'P',
            tr_type: isUnsub ? '2' : '1', // 1: 등록, 2: 해제
            'content-type': 'utf-8'
        },
        body: {
            input: {
                tr_id: 'H0STCNT0', // 실시간 체결가
                tr_key: code
            }
        }
    });
}

/** 실시간 데이터 파싱 (포맷: 유해더|데이터) */
function parseRealtimeData(data) {
    if (data.startsWith('0') || data.startsWith('1')) {
        const parts = data.split('|');
        if (parts.length < 4) return null;
        
        const tr_id = parts[1];
        const body = parts[3];
        const subParts = body.split('^');
        
        if (tr_id === 'H0STCNT0') {
            const parsed = {
                code: subParts[0],
                price: parseInt(subParts[2]),
                change_rate: parseFloat(subParts[5] || '0') // 4 is absolute change, 5 is percentage
            };
            console.log(`[KIS-WSS] Parsed: ${parsed.code} -> ${parsed.price} (${parsed.change_rate}%)`);
            return parsed;
        }
    }
    return null;
}

/** 웹소켓 서비스 시작 */
async function startWebSocketService(onPriceUpdate) {
    onPriceUpdateCallback = onPriceUpdate;
    if (!approvalKey) await getApprovalKey();
    if (!approvalKey) return;

    if (ws) {
        try { ws.terminate(); } catch(e) {}
    }

    console.log(`[KIS-WSS] Connecting to ${KIS_WS_URL}...`);
    ws = new WebSocket(KIS_WS_URL);

    ws.on('open', async () => {
        console.log('[KIS-WSS] 서버 연결 성공');
        // 기존 구독 종목 재등록
        if (subscribedCodes.size > 0) {
            console.log(`[KIS-WSS] Re-subscribing ${subscribedCodes.size} codes...`);
            for (const code of Array.from(subscribedCodes)) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(createSubMsg(code));
                }
                await new Promise(r => setTimeout(r, 200)); // [v6.2.3] 200ms delay to prevent kick
            }
        }
    });

    ws.on('message', (data) => {
        const msg = data.toString();

        if (msg.includes('PINGPONG')) {
            if (ws.readyState === WebSocket.OPEN) ws.send('PONG');
            return;
        }

        const parsed = parseRealtimeData(msg);
        if (parsed && onPriceUpdateCallback) {
            // [v6.1.5] Log price updates for monitoring
            if (msg.startsWith('0') || msg.startsWith('1')) {
                 console.log(`[KIS-WSS] SSE-PUSH-READY: ${parsed.code} | ${parsed.price} | ${parsed.change_rate}%`);
                 
                 // [v9.4.31] Save real-time price to Redis (TTL: 300s)
                 const priceData = JSON.stringify({
                     price:      Number(parsed.price),
                     changeRate: Number(parsed.change_rate),
                     time:       new Date().toLocaleTimeString('ko-KR', {
                                   hour: '2-digit', minute: '2-digit', hour12: false,
                                   timeZone: 'Asia/Seoul'
                                 }),
                     updatedAt:  Date.now()
                 });
                 redis.set(`realtime:price:${parsed.code}`, priceData, 'EX', 300)
                    .catch(err => console.warn(`[KIS-WSS] Redis 저장 실패 ${parsed.code}:`, err.message));
            }
            onPriceUpdateCallback(parsed.code, parsed.price, parsed.change_rate);
        } else {
            // Log response for subscription confirmation etc.
            try {
                const json = JSON.parse(msg);
                if (json.header && json.header.tr_id === 'H0STCNT0') {
                    const isSuccess = json.body?.rt_cd === '0';
                    const msg1 = json.body?.msg1 || '';
                    console.log(`[KIS-WSS] Subscription Resp: ${isSuccess ? 'SUCCESS' : 'FAIL'} (${msg1})`);
                    
                    // [TASK-01 REFINEMENT] Handle invalid approval by clearing Redis cache
                    const lowerMsg = msg1.toLowerCase();
                    if (!isSuccess && (lowerMsg.includes('invalid approval') || lowerMsg.includes('auth') || lowerMsg.includes('권한'))) {
                        console.error(`[KIS-WSS] CRITICAL: Auth error detected (${msg1}). Purging Redis cache ${REDIS_KEY}...`);
                        redis.del(REDIS_KEY).then(() => {
                            approvalKey = null;
                            if (ws) {
                                console.log('[KIS-WSS] Terminating WS for fresh reconnection...');
                                ws.terminate();
                            }
                        }).catch(err => {
                            console.error('[KIS-WSS] Failed to purge Redis cache:', err.message);
                        });
                    }
                }
            } catch(e) {}
        }
    });

    ws.on('error', (e) => console.error('[KIS-WSS] Error:', e.message));
    ws.on('close', () => {
        console.warn('[KIS-WSS] 연결 종료. 5초 후 재시도...');
        setTimeout(() => startWebSocketService(onPriceUpdateCallback), 5000);
    });
}

/** 종목 구독 추가/변경 (최대 40개 제한 관리) */
async function updateSubscriptions(codes) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        codes.forEach(c => subscribedCodes.add(c));
        return;
    }

    const newSet = new Set(codes.slice(0, 40)); // 40개 상한
    
    // 해제할 종목
    for (const oldCode of Array.from(subscribedCodes)) {
        if (!newSet.has(oldCode)) {
            ws.send(createSubMsg(oldCode, true));
            await new Promise(r => setTimeout(r, 200));
        }
    }

    // 등록할 종목
    for (const newCode of Array.from(newSet)) {
        if (!subscribedCodes.has(newCode)) {
            ws.send(createSubMsg(newCode));
            await new Promise(r => setTimeout(r, 200));
        }
    }

    subscribedCodes = newSet;
}

/** 현재 구독 중인 종목 리스트 반환 (Set) */
function getSubscribedCodes() {
    return subscribedCodes;
}

module.exports = { startWebSocketService, updateSubscriptions, getSubscribedCodes };
