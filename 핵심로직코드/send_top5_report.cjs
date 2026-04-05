const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');

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
        const sig2H = s.tfSigs['2H'];
        content += `${idx + 1}️⃣ ${s.name} (${s.code}) - 점수: ${s.score}점\n`;
        content += `- 현황: ${sig2H?.category || '-'} | 추세강도: ${Math.round(sig2H?.adx || 0)}\n`;
        content += `- 매수전략: ${Math.round(sig2H?.result_2 || 0).toLocaleString()}원(1차) / ${Math.round(sig2H?.result_3 || 0).toLocaleString()}원(2차) 분할진입 유효\n`;
        let target1 = sig2H?.bb_upper || 0;
        const curPrice = sig2H?.current_price || 0;
        if (target1 > 0 && curPrice >= target1) target1 = curPrice * 1.05;

        const target2 = Math.round(target1 * 1.03);
        content += `- 목표가: 1차 ${Math.round(target1).toLocaleString()}원 / 2차 ${target2.toLocaleString()}원\n`;
        content += `- 손절가: ${Math.round((sig2H?.result_3 || 0) * 0.98).toLocaleString()}원 (2차 진입가 대비 -2%)\n`;
        content += `- 차트: https://kr.tradingview.com/chart/?symbol=KRX:${s.code}\n\n`;
    });

    content += `💡 Antigravity Tip: 오전 10시 이후 눌림 지지 확인 후 진입 권장.\n`;
    content += `---\n`;
    content += `* 본 리포트는 MP AI 분석 시스템에 의해 생성되었습니다.`;
    return content;
};

async function sendReport() {
    console.log('[Telegram-Report] Starting...');
    try {
        if (!fs.existsSync(SIGNALS_FILE) || !fs.existsSync(STOCK_MASTER_FILE)) {
            console.error('Data files missing');
            return;
        }

        const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));

        const results = stocks.map(stock => {
            const tfSigs = getSignalsForStock(signals, stock.code);
            const score = calculateTotalScore(tfSigs);
            return { ...stock, score, tfSigs };
        }).sort((a, b) => b.score - a.score).slice(0, 5);

        const message = generateMessage(results);
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
