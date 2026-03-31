const { calculateSignals } = require('../analyzer.cjs');

// Mock OHLC history with 60 candles (each 1 hour apart)
const now = Date.now();
const oneHour = 60 * 60 * 1000;
const history = {
    time: Array.from({ length: 60 }, (_, i) => Math.floor((now - (60 - i) * oneHour) / 1000)),
    close: Array.from({ length: 60 }, (_, i) => 10000 + i * 10),
    open: Array.from({ length: 60 }, (_, i) => 9990 + i * 10),
    high: Array.from({ length: 60 }, (_, i) => 10020 + i * 10),
    low: Array.from({ length: 60 }, (_, i) => 9980 + i * 10),
    volume: Array.from({ length: 60 }, () => 100000)
};

console.log('--- Testing 2H timeframe ---');
const result2H = calculateSignals(history, '2H');
console.log('2H Progress:', result2H.progress);
console.log('2H signal_HH:', result2H.signal_HH);

if (result2H.progress > 0.3) {
    console.log('SUCCESS: 2H progress correctly calculated (> 0.3)');
} else {
    console.error('FAILURE: 2H progress still too low (<= 0.3)');
}

console.log('--- Testing 1D timeframe (Baseline) ---');
const result1D = calculateSignals(history, '1D');
console.log('1D Progress:', result1D.progress);
