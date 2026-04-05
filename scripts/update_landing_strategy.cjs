const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { calculateTotalScore } = require('../src/utils/scoreEngine.cjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'landing_strategy.json');

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

// calculateTotalScore is now imported from scoreEngine.cjs

async function updateLandingStrategy() {
    console.log('[Landing-Strategy] Updating...');
    try {
        if (!fs.existsSync(SIGNALS_FILE) || !fs.existsSync(STOCK_MASTER_FILE)) {
            console.error('Data files missing');
            return;
        }

        const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));

        const results = stocks.map(stock => {
            const tfSigs = getSignalsForStock(signals, stock.code);
            const latest = signals.filter(s => s.code === stock.code).sort((a,b)=>b.timestamp-a.timestamp)[0];
            const { score } = calculateTotalScore(tfSigs, latest);
            return { ...stock, score, tfSigs };
        }).sort((a, b) => b.score - a.score).slice(0, 5);

        const finalData = {
            updatedAt: new Date().toISOString(),
            stocks: results.map(s => ({
                name: s.name,
                code: s.code,
                score: s.score,
                category: s.tfSigs['2H']?.category || '분석 중',
                adx: Math.round(s.tfSigs['2H']?.adx || 0),
                entryPrice: s.tfSigs['2H']?.result_2 || 0,
                entryPrice1: s.tfSigs['2H']?.result_2 || 0,
                entryPrice2: s.tfSigs['2H']?.result_3 || 0,
                targetPrice: Math.round(s.tfSigs['2H']?.bb_upper || 0),
                targetPrice2: Math.round((s.tfSigs['2H']?.bb_upper || 0) * 1.05),
                stopLoss: s.tfSigs['2H']?.stop_loss || 0,
                isNew: (Date.now() - (s.tfSigs['2H']?.timestamp || 0)) < 24 * 60 * 60 * 1000
            }))
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
        console.log(`[Landing-Strategy] Success. Saved to ${OUTPUT_FILE}`);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

updateLandingStrategy();
