const cache = require('../src/services/cacheService.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const { enrichWithManualPrices } = require('../src/utils/manualPriceEnricher.cjs');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map(id => id.trim())
    .filter(id => id.length > 0);

const getSignalsForStock = (signals, code) => {
    const stockSignals = signals.filter(s => s.code === code);
    const timeframes = ["30M", "1H", "2H", "4H", "1D", "2D", "1W"];
    const status = {};
    timeframes.forEach(tf => {
        const latest = stockSignals
            .filter(s => s.timeframe === tf)
            .sort((a, b) => b.timestamp - a.timestamp)[0];
        status[tf] = latest;
    });
    return status;
};

const calculateTotalScore = (tfSigs) => {
    let score = 0;
    const sig2H = tfSigs['2H'];
    const sig1H = tfSigs['1H'];
    const sig30M = tfSigs['30M'];
    const price = sig2H ? sig2H.current_price : 0;
    if (!price) return 0;

    if (sig2H && sig2H.cond_up7) score += 20;
    if (sig2H && sig2H.DHH2) score += 20;
    const isAligned = sig2H && (sig2H.sma5 > sig2H.sma10 && sig2H.sma10 > sig2H.sma20 && sig2H.sma20 > sig2H.sma60);
    if (isAligned) score += 10;
    const hasLowTfMomentum = (sig1H && sig1H.signal_HH) || (sig30M && sig30M.signal_HH);
    if (sig2H && sig2H.cond_up7 && hasLowTfMomentum) score += 15;
    if (isAligned && price < sig2H.sma5 && price > sig2H.sma10) score += 5;
    if (isAligned && price < sig2H.sma10 && price > sig2H.sma20) score += 3;
    
    ["30M", "1H", "2H", "4H", "1D", "2D", "1W"].forEach(tf => {
        const s = tfSigs[tf];
        if (s) {
            if (s.signal_HH) score += 1; 
            if (s.cond_up7) score += 1;  
            if (s.cond_strong_trend) score += 2; 
            if (s.is_strong_signal && s.signal_HH) score += 2; 
        }
    });
    
    if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) score += 5;
    if (sig2H && sig2H.sma5 < sig2H.sma20) score -= 20;

    return score;
};

const generateMessage = (top5) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateStr = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`;

    let content = `🚀 [내일(${dateStr}) 주도주 매매 전략 Top 5]\n\n`;

    top5.forEach((s, idx) => {
        content += `${idx + 1}️⃣ ${s.name} (${s.code}) - 점수: ${s.star_grade || 0}등급\n`;
        content += `- 현황: ${s.trend || '-'} | 추세강도: ${Math.round(s.trend_strength || 0)}\n`;
        content += `- 진입전략: ${Math.round(s.entry_price_1 || 0).toLocaleString()}원(1차) / ${Math.round(s.entry_price_2 || 0).toLocaleString()}원(2차) 분할진입 유효\n`;
        content += `- 목표가: 1차 ${Math.round(s.target_price_1 || 0).toLocaleString()}원 / 2차 ${Math.round((s.target_price_1 || 0) * 1.05).toLocaleString()}원\n`;
        content += `- 손절가: ${Math.round(s.stop_loss || 0).toLocaleString()}원 (2차 진입가 대비 -2%)\n`;
        content += `- 차트: https://www.tradingview.com/chart/?symbol=KRX:${s.code}\n\n`;
    });

    content += `💡 Antigravity Tip: 오전 10시 이후 눌림 지지 확인 후 진입 권장.\n`;
    content += `---\n`;
    content += `* 본 리포트는 MP AI 분석 시스템에 의해 생성되었습니다.`;
    return content;
};

async function sendReport() {
    console.log('[Telegram-Report] Starting...');
    try {
        // 1. DB에서 hybridScore(총점)가 높은 상위 5종목 조회
        const top5FromDb = await prisma.dailyStockSnapshot.findMany({
            where: { hybridScore: { gt: 0 } },
            orderBy: [
                { hybridScore: 'desc' },
                { createdAt: 'desc' }
            ],
            take: 5
        });

        if (top5FromDb.length === 0) {
            console.error('[Telegram-Report] No active Top 5 stocks found in DB.');
            return;
        }

        // 2. [v9.5.5] 중앙 집중형 관리 가격 보강 (ManualPriceEnricher 활용)
        const enriched = await enrichWithManualPrices(top5FromDb, prisma);

        const top5 = enriched.map((stock) => {
            return {
                code: stock.ticker || stock.code,
                name: stock.name,
                entry_price_1: stock.entry_price_1,
                entry_price_2: stock.entry_price_2,
                stop_loss: stock.stop_loss,
                target_price_1: stock.target_price_1,
                trend: stock.category || '-',
                trend_strength: stock.adx || 0,
                star_grade: stock.hybridScore // totalScore로 등급 대체
            };
        });

        const message = generateMessage(top5);
        console.log('--- GENERATED MESSAGE ---\n', message);

        if (process.argv.includes('--test')) {
            console.log('[Test-Mode] Skip sending.');
            return;
        }

        for (const chatId of TELEGRAM_CHAT_IDS) {
            try {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: chatId.trim(),
                    text: message
                });
                console.log(`Sent to ${chatId}`);
            } catch (e) {
                console.error(`Failed to send to ${chatId}:`, e.message);
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

sendReport();
