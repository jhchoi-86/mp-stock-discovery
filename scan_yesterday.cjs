const fs = require('fs');

// v3.4.0 Scoring Logic (simplified for scanning)
const calculateScore = (tfSigs) => {
    let score = 0;
    const sig2H = tfSigs['2H'];
    const sig1H = tfSigs['1H'];
    const sig30M = tfSigs['30M'];
    
    if (!sig2H) return 0;
    if (sig2H.cond_up7) score += 20;
    if (sig2H.DHH2) score += 20;
    const isAligned = (sig2H.sma5 > sig2H.sma10 && sig2H.sma10 > sig2H.sma20 && sig2H.sma20 > sig2H.sma60);
    if (isAligned) score += 10;
    
    const hasLowTfMomentum = (sig1H && sig1H.signal_HH) || (sig30M && sig30M.signal_HH);
    if (sig2H.cond_up7 && hasLowTfMomentum) score += 15;
    
    // Simple Overlap (HH/Trend only)
    ["30M", "1H", "2H", "4H", "1D", "2D", "1W"].forEach(tf => {
        const s = tfSigs[tf];
        if (s) {
            if (s.signal_HH) score += 1;
            if (s.cond_up7) score += 1;
            if (s.is_strong_signal && s.signal_HH) score += 4; // Rule 8+9 approx
        }
    });
    
    if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) score += 5;
    if (sig2H.sma5 < sig2H.sma20) score -= 20;

    return score;
};

const main = () => {
    const data = JSON.parse(fs.readFileSync('c:/Users/danbe/Documents/Antigravity/주식종목발굴/data/signals.json', 'utf8'));
    
    // Find timestamps for 2026-04-01 (approx 1775010000000 to 1775100000000)
    const yesterdayStart = 1775010000000;
    const yesterdayEnd = 1775100000000;
    
    const stocks = {}; // code -> timeframe -> signal
    
    data.forEach(s => {
        if (s.timestamp >= yesterdayStart && s.timestamp <= yesterdayEnd) {
            if (!stocks[s.code]) stocks[s.code] = { name: s.name, tfs: {} };
            if (!stocks[s.code].tfs[s.timeframe] || stocks[s.code].tfs[s.timeframe].timestamp < s.timestamp) {
                stocks[s.code].tfs[s.timeframe] = s;
            }
        }
    });
    
    const results = [];
    for (const code in stocks) {
        const score = calculateScore(stocks[code].tfs);
        if (score > 0) {
            results.push({ code, name: stocks[code].name, score });
        }
    }
    
    results.sort((a,b) => b.score - a.score);
    console.log(JSON.stringify(results.slice(0, 10), null, 2));
};

main();
