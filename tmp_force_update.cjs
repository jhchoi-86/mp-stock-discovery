const fs = require('fs');
const { savePastRecommendations } = require('./src/utils/historyManager.cjs');

const SIGNALS_FILE = 'data/signals.json';
const STOCK_MASTER_FILE = 'data/stock_master.json';

const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));

const getSignalsForStock = (code) => {
    const stockSignals = signals.filter(s => s.code === code);
    const timeframes = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"];
    const status = {};
    timeframes.forEach(tf => {
        const latest = stockSignals.filter(s => s.timeframe === tf).sort((a, b) => b.timestamp - a.timestamp)[0];
        status[tf] = latest;
    });
    return status;
};

const getLatestGlobal = (code) => signals.filter(s => s.code === code).sort((a, b) => b.timestamp - a.timestamp)[0];

let candidates = stocks.map(stock => {
    const tfSigs = getSignalsForStock(stock.code);
    const latest = getLatestGlobal(stock.code);
    
    let score = 0;              
    
    // 1️⃣ 베스트 타임프레임 코어 점수 (Max 50점)
    let coreScore = 0;
    const tfs = ['2H', '1D', '1W'];
    
    tfs.forEach(tf => {
        let tfScore = 0;
        if (tfSigs[tf] && tfSigs[tf].cond_up7) tfScore += 25;
        if (tfSigs[tf] && (tfSigs[tf].signal_HH || tfSigs[tf].DHH2)) tfScore += 25;
        if (tfScore > coreScore) coreScore = tfScore; 
    });
    score += coreScore;
    
    // 2️⃣ 장기 수급 폭발 보너스 (거래량) (Max 10점)
    if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) score += 5;
    if (tfSigs['1W'] && tfSigs['1W'].trigger_vol) score += 5;

    // 3️⃣ 스나이퍼 진입 타점 정밀도 (Max 10점)
    let bestDistScore = 0;
    const curPrice = latest?.current_price || latest?.entry_price || 0;
    if (curPrice > 0) {
        tfs.forEach(tf => {
            if (tfSigs[tf] && tfSigs[tf].result_2) {
                const diffPct = ((curPrice - tfSigs[tf].result_2) / tfSigs[tf].result_2) * 100;
                if (diffPct >= 0 && diffPct <= 0.5) bestDistScore = Math.max(bestDistScore, 6);
                else if (diffPct > 0.5 && diffPct <= 1.0) bestDistScore = Math.max(bestDistScore, 4);
            }
        });
    }
    score += bestDistScore;

    // 4️⃣ 다중 시간대(MTF) 프랙탈 매수 보너스 (Max 30점)
    if (tfSigs['2H'] && (tfSigs['2H'].signal_HH || tfSigs['2H'].DHH2)) score += 10;
    if (tfSigs['1D'] && (tfSigs['1D'].signal_HH || tfSigs['1D'].DHH2)) score += 10;
    if (tfSigs['1W'] && (tfSigs['1W'].signal_HH || tfSigs['1W'].DHH2)) score += 10;

    const bonus = latest?.kis_change_data?.bonus_score || 0;
    score += bonus;

    return { ...stock, timeframeStatus: tfSigs, latestSignal: latest, total_score: Math.min(score, 100) };
}).filter(s => s.latestSignal);

// Removing the strict adx and cond_up7 trend filter so it directly reflects the Top 15 raw scores (like the Desktop UI candidates)

candidates = candidates.sort((a, b) => b.total_score - a.total_score);
const approvedStocks = candidates.slice(0, 15);

if (approvedStocks.length > 0) {
    savePastRecommendations(approvedStocks);
    console.log(`Successfully generated past_recommendations.json with top ${approvedStocks.length} targets.`);
} else {
    console.log("No targets found");
}
