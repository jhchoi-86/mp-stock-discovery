const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const COIN_REC_FILE = path.join(__dirname, '..', '..', 'data', 'coin_recommendations.json');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Use Map to track alerts (Spam prevention similar to KIS logic)
// Format: { code: { count: number, lastAlert: number } }
const alertCache = new Map();
const MAX_ALERTS_PER_DAY = 3;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Upbit REST batch endpoint
const UPBIT_URL = 'https://api.upbit.com/v1/ticker';

async function sendTelegramAlert(code, name, targetPrice, currentPrice, category) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('[CoinMonitor] 텔레그램 토큰이 설정되지 않아 발송을 생략합니다.');
        return;
    }

    const state = alertCache.get(code) || { count: 0, lastAlert: 0 };
    const now = Date.now();

    if (state.count >= MAX_ALERTS_PER_DAY) {
        // console.log(`[CoinMonitor] ${name}(${code}) 금일 전송 횟수 초과 (${MAX_ALERTS_PER_DAY}회).`);
        return;
    }

    if (now - state.lastAlert < COOLDOWN_MS) {
        // console.log(`[CoinMonitor] ${name}(${code}) 쿨다운 대기 중...`);
        return;
    }

    state.count += 1;
    state.lastAlert = now;
    alertCache.set(code, state);

    const diffPct = ((currentPrice - targetPrice) / targetPrice * 100).toFixed(2);
    const sign = diffPct > 0 ? '+' : '';
    const remaining = MAX_ALERTS_PER_DAY - state.count;

    const message = `🚨 [MP 코인 정밀타점 진입 알람] 🚨\n\n` +
        `🔹 종목: ${name} (${code})\n` +
        `🏷️ 분류: ${category || '야간 관심코인'}\n` +
        `🎯 목표 타점: ${targetPrice.toLocaleString()}원\n` +
        `💰 현재 도달가: ${currentPrice.toLocaleString()}원 (${sign}${diffPct}%)\n\n` +
        `📈 업비트 차트: https://upbit.com/exchange?code=CRIX.UPBIT.${code}\n\n` +
        `🔔 금일 잔여 알람 횟수: ${remaining}회\n\n` +
        `⚠️ 본 알람은 자동매매 진입이 아니며, 참고용으로 제공됩니다. 모든 투자의 책임은 본인에게 있습니다.`;

    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            disable_web_page_preview: true
        });
        console.log(`[CoinMonitor] 텔레그램 알람 전송 완료: ${name} (${currentPrice}원)`);
    } catch (e) {
        console.error(`[CoinMonitor-Telegram Error]:`, e.message);
    }
}

async function runCoinMonitorLoop() {
    console.log('[CoinMonitor] Upbit V3 REST Tracking Daemon Started (2 sec polling)...');

    setInterval(async () => {
        try {
            if (!fs.existsSync(COIN_REC_FILE)) return;
            const recs = JSON.parse(fs.readFileSync(COIN_REC_FILE, 'utf8'));
            if (!recs || recs.length === 0) return;

            const targetMap = new Map();
            const markets = [];
            for (const r of recs) {
                targetMap.set(r.code, r);
                markets.push(r.code);
            }

            // Request batch prices
            const res = await axios.get(`${UPBIT_URL}?markets=${markets.join(',')}`);
            const tickerData = res.data;

            for (const item of tickerData) {
                const curPrice = item.trade_price;
                const rec = targetMap.get(item.market);
                if (!rec || !rec.rec_price) continue;

                const targetPrice = rec.rec_price;
                const margin = targetPrice * 0.001; // 0.1% threshold
                
                if (Math.abs(curPrice - targetPrice) <= margin) {
                    await sendTelegramAlert(
                        rec.code, 
                        rec.name, 
                        targetPrice, 
                        curPrice, 
                        rec.category
                    );
                }
            }
        } catch (e) {
            console.error('[CoinMonitor Polling Error]:', e.message);
        }
    }, 2000); // 1 TPS on UPBIT API (5 req/sec is usually limit, 2sec interval is super safe)
}

// 24H Cache Reset schedule (KST Midnight)
cron.schedule('0 0 * * *', () => {
    alertCache.clear();
    console.log('[CoinMonitor] Daily Spam Cache Cleared (KST Midnight).');
}, { timezone: 'Asia/Seoul' });

// Ensure template file exists
if (!fs.existsSync(COIN_REC_FILE)) {
    fs.writeFileSync(COIN_REC_FILE, JSON.stringify([
        {
            "code": "KRW-BTC",
            "name": "비트코인",
            "rec_price": 0,
            "category": "예시 - 타점 입력 시 동작"
        }
    ], null, 2));
}

runCoinMonitorLoop();
