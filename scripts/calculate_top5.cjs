const fs = require('fs');

const signalsData = fs.readFileSync('signals_b64.txt', 'utf8').replace(/\s/g, '');
const stocksData = fs.readFileSync('stock_master_b64.txt', 'utf8').replace(/\s/g, '');

const signals = JSON.parse(Buffer.from(signalsData, 'base64').toString('utf8'));
const stocks = JSON.parse(Buffer.from(stocksData, 'base64').toString('utf8'));

const getSignalsForStock = (code) => {
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

    // 1. Trend Filter (2H): cond_up7 -> 20 pts
    if (sig2H && sig2H.cond_up7) score += 20;
    
    // 2. Pullback Detection (2H): DHH2 -> 20 pts
    if (sig2H && sig2H.DHH2) score += 20;
    
    // 3. MA Alignment (2H): 5 > 10 > 20 > 60 -> 10 pts
    const isAligned = sig2H && (sig2H.sma5 > sig2H.sma10 && sig2H.sma10 > sig2H.sma20 && sig2H.sma20 > sig2H.sma60);
    if (isAligned) score += 10;
    
    // 4. Hybrid Momentum Bonus: 2H Trend & (1H/30M Buy Signal) -> 15 pts
    const hasLowTfMomentum = (sig1H && sig1H.signal_HH) || (sig30M && sig30M.signal_HH);
    if (sig2H && sig2H.cond_up7 && hasLowTfMomentum) score += 15;
    
    // 5. Divergence A (2H): Align & 10MA < Price < 5MA -> 5 pts
    if (isAligned && price < sig2H.sma5 && price > sig2H.sma10) score += 5;
    
    // 6. Divergence B (2H): Align & 20MA < Price < 10MA -> 3 pts
    if (isAligned && price < sig2H.sma10 && price > sig2H.sma20) score += 3;
    
    // 7-10. Signal Overlap
    const tfs = ["30M", "1H", "2H", "4H", "1D", "2D", "1W"];
    tfs.forEach(tf => {
        const s = tfSigs[tf];
        if (s) {
            if (s.signal_HH) score += 1; 
            if (s.cond_up7) score += 1;  
            if (s.cond_strong_trend) score += 2; 
            if (s.is_strong_signal && s.signal_HH) score += 2; 
        }
    });
    
    // 11. Volume Surge (1D): > 1.5x avg -> 5 pts
    if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) score += 5;
    
    // 12. Bearish Condition: 5MA < 20MA (2H) -> -20 pts
    if (sig2H && sig2H.sma5 < sig2H.sma20) score -= 20;

    return score;
};

const results = stocks.map(stock => {
    const tfSigs = getSignalsForStock(stock.code);
    const score = calculateTotalScore(tfSigs);
    return { ...stock, score, tfSigs };
});

const top5 = results.sort((a, b) => b.score - a.score).slice(0, 5);

console.log(JSON.stringify(top5, null, 2));
