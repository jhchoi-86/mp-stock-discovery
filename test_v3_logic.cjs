
const path = require('path');
const fs = require('fs');

// Mock data for 100 candles
const generateMockOHLC = (count) => {
    const close = Array.from({length: count}, (_, i) => 1000 + i * 2 + Math.random() * 10);
    const open = close.map(c => c - 5 + Math.random() * 10);
    const high = close.map((c, i) => Math.max(c, open[i]) + 5);
    const low = close.map((c, i) => Math.min(c, open[i]) - 5);
    const volume = Array.from({length: count}, () => 10000 + Math.random() * 5000);
    const time = Array.from({length: count}, (_, i) => Date.now() - (count - i) * 60000);
    return { time, open, high, low, close, volume };
};

// Import from analyzer.cjs
// Note: We need to mock some globals if analyzer relies on them
const analyzer = require('./analyzer.cjs');

async function test() {
    const ohlc = generateMockOHLC(100);
    const result = analyzer.calculateSignals(
        ohlc.time, ohlc.open, ohlc.high, ohlc.low, ohlc.close, ohlc.volume,
        '30M',
        { kis_change_data: { bonus_score: 5 } }
    );
    
    console.log('--- TEST RESULT (30M) ---');
    console.log(JSON.stringify(result, null, 2));
}

test();
