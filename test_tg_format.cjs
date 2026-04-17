const fs = require('fs');
require('dotenv').config();

const signalsData = fs.readFileSync('signals_b64.txt', 'utf8').replace(/\s/g, '');
const stocksData = fs.readFileSync('stock_master_b64.txt', 'utf8').replace(/\s/g, '');

const signals = JSON.parse(Buffer.from(signalsData, 'base64').toString('utf8'));
const stocks = JSON.parse(Buffer.from(stocksData, 'base64').toString('utf8'));

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
        const sig1D = s.tfSigs['1D'];
        content += `${idx + 1}️⃣ ${s.name} (${s.code}) - 점수: ${s.score}점\n`;
        content += `- 현황: ${sig2H?.category || '-'} | 추세강도: ${Math.round(sig2H?.adx || 0)}\n`;
        content += `- 매수전략: ${Math.round(sig2H?.result_2 || 0).toLocaleString()}원 부근 눌림 입성 유효\n`;
        content += `- 목표가: 1차 ${Math.round(sig2H?.bb_upper || 0).toLocaleString()}원 / 2차 ${Math.round((sig2H?.bb_upper || 0) * 1.05).toLocaleString()}원\n`;
        content += `- 손절가: ${Math.round((sig2H?.result_3 || 0) * 0.98).toLocaleString()}원 (지표 이탈 시)\n`;
        content += `- 차트: https://www.tradingview.com/chart/?symbol=KRX:${s.code}\n\n`;
    });

    content += `💡 Antigravity Tip: 오전 10시 이후 눌림 지지 확인 후 진입 권장.\n`;
    content += `---\n`;
    content += `* 본 리포트는 MP AI 분석 시스템에 의해 생성되었습니다.`;
    return content;
};

const results = stocks.map(stock => {
    const tfSigs = getSignalsForStock(signals, stock.code);
    const score = calculateTotalScore(tfSigs);
    return { ...stock, score, tfSigs };
}).sort((a, b) => b.score - a.score).slice(0, 5);

const message = generateMessage(results);
console.log(message);
