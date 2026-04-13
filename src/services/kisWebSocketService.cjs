const WebSocket = require('ws');
const axios = require('axios');
require('dotenv').config();

const KIS_WS_URL = 'ws://ops.koreainvestment.com:21000';
const APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();

let ws = null;
let approvalKey = null;
let subscribedCodes = new Set();
let onPriceUpdateCallback = null;

/** 웹소켓 접속용 Approval Key 발급 */
async function getApprovalKey() {
    try {
        const res = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/Approval', {
            grant_type: 'client_credentials',
            appkey: APP_KEY,
            secretkey: APP_SECRET
        });
        approvalKey = res.data.approval_key;
        console.log('[KIS-WSS] Approval Key 발급 성공');
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
            }
            onPriceUpdateCallback(parsed.code, parsed.price, parsed.change_rate);
        } else {
            // Log response for subscription confirmation etc.
            try {
                const json = JSON.parse(msg);
                if (json.header && json.header.tr_id === 'H0STCNT0') {
                    console.log(`[KIS-WSS] Subscription Resp: ${json.body?.rt_cd === '0' ? 'SUCCESS' : 'FAIL'} (${json.body?.msg1})`);
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
