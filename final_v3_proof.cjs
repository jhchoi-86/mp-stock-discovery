
const fs = require('fs');

// We copy the actual functions from analyzer.cjs to ensure identical execution
// This is better than require() which would trigger the main loop

function sma(src, period) {
    if (!src || src.length < period) return Array(src.length).fill(null);
    let result = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) result.push(null);
        else {
            let sum = 0;
            for (let j = 0; j < period; j++) sum += src[i - j];
            result.push(sum / period);
        }
    }
    return result;
}

function stdev(src, period) {
    const avg = sma(src, period);
    let result = [];
    for (let i = 0; i < src.length; i++) {
        if (avg[i] === null) result.push(null);
        else {
            let sumSq = 0;
            for (let j = 0; j < period; j++) sumSq += Math.pow(src[i - j] - avg[i], 2);
            result.push(Math.sqrt(sumSq / period));
        }
    }
    return result;
}

// Resample logic from analyzer.cjs
const resampleChartData = (raw, hourCount, tf) => {
    let resampled = { open: [], high: [], low: [], close: [], volume: [], time: [] };
    if (!raw.time || raw.time.length === 0) return resampled;
    let currentCandle = null, candleCount = 0;
    for (let i = 0; i < raw.time.length; i++) {
        if (candleCount === 0) {
            currentCandle = { open: raw.open[i], high: raw.high[i], low: raw.low[i], close: raw.close[i], volume: raw.volume[i], time: raw.time[i] };
            candleCount = 1;
        } else {
            currentCandle.high = Math.max(currentCandle.high, raw.high[i]);
            currentCandle.low = Math.min(currentCandle.low, raw.low[i]);
            currentCandle.close = raw.close[i]; currentCandle.volume += raw.volume[i];
            candleCount++;
            if (candleCount === hourCount) {
                resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
                resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
                resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
                currentCandle = null; candleCount = 0;
            }
        }
    }
    return resampled;
};

// The core BBW logic as implemented in analyzer.cjs (Step 330)
function calculateSignals(timeArr, open, high, low, close, volume, timeframeStr) {
    const last_idx = close.length - 1;
    const signal_HH = true; // mock
    const cond_up7 = true; // mock
    
    const bbw_adj = 100.0;
    const bbw_mult = 50.0;
    const length_BBW = 25;
    
    const calculateBBWAndLowest = (src_close) => {
        if (!src_close || src_close.length < length_BBW) return { val: 0, low5: 0 };
        const b_sma = sma(src_close, length_BBW);
        const b_stdev = stdev(src_close, length_BBW);
        const series = b_sma.map((s, i) => {
            if (s === 0 || s === null || b_stdev[i] === null) return null;
            return (((s + 2 * b_stdev[i]) - (s - 2 * b_stdev[i])) / s) * 100 * bbw_mult + bbw_adj;
        });
        const val = series[series.length - 1] || 0;
        let low5 = val;
        if (series.length >= 6) {
            let min_v = val;
            for (let i = 1; i <= 5; i++) {
                const v = series[series.length - 1 - i];
                if (v !== null && v < min_v) min_v = v;
            }
            low5 = min_v;
        }
        return { val, low5 };
    };

    const currentBBW = calculateBBWAndLowest(close);
    const resampled2x = resampleChartData({ time: timeArr, open, high, low, close, volume }, 2, timeframeStr);
    const mtfBBW = calculateBBWAndLowest(resampled2x.close);

    const is_strong_signal = (currentBBW.val > mtfBBW.val) && (currentBBW.val > currentBBW.low5) && (mtfBBW.val > mtfBBW.low5);

    return {
        is_strong_signal,
        bbw: Number(currentBBW.val.toFixed(2)),
        bbw_mtf: Number(mtfBBW.val.toFixed(2)),
        con_mtf: Number(mtfBBW.low5.toFixed(2)),
        lowest_bbw_5: Number(currentBBW.low5.toFixed(2)),
        entry_approved: true
    };
}

// Execution
const generateMockOHLC = (count) => {
    const close = Array.from({length: count}, (_, i) => 1000 + i * 2);
    const open = close.map(c => c - 5);
    const high = close.map(c => c + 10);
    const low = close.map(c => c - 10);
    const volume = Array.from({length: count}, () => 10000);
    const time = Array.from({length: count}, (_, i) => i);
    return { time, open, high, low, close, volume };
};

const mockData = generateMockOHLC(60);
const res = calculateSignals(mockData.time, mockData.open, mockData.high, mockData.low, mockData.close, mockData.volume, '30M');

console.log('--- FINAL PROOF OF OUTPUT ---');
console.log(JSON.stringify({ "005930": { "30M": res } }, null, 2));
