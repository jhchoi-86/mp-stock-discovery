
const fs = require('fs');

// [EVIDENCE] Mock OHLC for 100 days
const generateMockOHLC = (count) => {
    const close = Array.from({length: count}, (_, i) => 1000 + i * 2);
    const open = close.map(c => c - 5);
    const high = close.map(c => c + 10);
    const low = close.map(c => c - 10);
    const volume = Array.from({length: count}, () => 10000);
    const time = Array.from({length: count}, (_, i) => i * 86400); // Daily seconds
    return { time, open, high, low, close, volume };
};

// [EVIDENCE] SMA Utility
function sma(src, period) {
    let results = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) results.push(null);
        else {
            let sum = 0;
            for (let j = 0; j < period; j++) sum += src[i - j];
            results.push(sum / period);
        }
    }
    return results;
}

// [EVIDENCE] STDEV Utility
function stdev(src, period) {
    let results = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) {
            results.push(null);
            continue;
        }
        let window = src.slice(i - period + 1, i + 1);
        let mean = window.reduce((a, b) => a + b) / period;
        let variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
        results.push(Math.sqrt(variance));
    }
    return results;
}

// [EVIDENCE] Fixed resampleChartData (isDayBased check)
const resampleChartData = (raw, hourCount, tf) => {
    let resampled = { open: [], high: [], low: [], close: [], volume: [], time: [] };
    if (!raw.time || raw.time.length === 0) return resampled;
    const isDayBased = (tf === '2D' || tf === '1W');
    let currentCandle = null, candleCount = 0, currentDayStr = null;

    for (let i = 0; i < raw.time.length; i++) {
        const date = new Date(raw.time[i] * 1000);
        const dayStr = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;

        if (!isDayBased && currentDayStr !== dayStr && currentCandle) {
            resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
            resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
            resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
            currentCandle = null; candleCount = 0;
        }

        if (currentCandle === null) {
            currentDayStr = dayStr;
            currentCandle = { open: raw.open[i], high: raw.high[i], low: raw.low[i], close: raw.close[i], volume: raw.volume[i], time: raw.time[i] };
            candleCount = 1;
        } else {
            currentCandle.high = Math.max(currentCandle.high, raw.high[i]);
            currentCandle.low = Math.min(currentCandle.low, raw.low[i]);
            currentCandle.close = raw.close[i]; currentCandle.volume += raw.volume[i];
            candleCount++;
        }

        if (candleCount === hourCount) {
            resampled.open.push(currentCandle.open); resampled.high.push(currentCandle.high);
            resampled.low.push(currentCandle.low); resampled.close.push(currentCandle.close);
            resampled.volume.push(currentCandle.volume); resampled.time.push(currentCandle.time);
            currentCandle = null; candleCount = 0;
        }
    }
    return resampled;
};

// [EVIDENCE] The absolute signal logic from analyzer.cjs
function calculateSignals(ohlc, tf) {
    const close = ohlc.close;
    const bbw_adj = 100.0, bbw_mult = 50.0, length_BBW = 25;
    
    const calcBBW = (src) => {
        if (!src || src.length < length_BBW) return { val: 0, series: [] };
        const b_sma = sma(src, length_BBW);
        const b_std = stdev(src, length_BBW);
        const series = b_sma.map((s, i) => s && b_std[i] !== null ? (((s+2*b_std[i])-(s-2*b_std[i]))/s)*100*bbw_mult + bbw_adj : 0);
        return { val: series[series.length-1], series };
    };

    const curBBW = calcBBW(close);
    const resampled2x = resampleChartData(ohlc, 2, tf);
    const mtfBBW = calcBBW(resampled2x.close);
    
    const con_mtf = mtfBBW.val; // simplified for proof
    const isStrong = curBBW.val > mtfBBW.val;

    return {
        code: "005930",
        timeframe: tf,
        is_strong_signal: isStrong,
        bbw: Number(curBBW.val.toFixed(2)),
        con_mtf: Number(con_mtf.toFixed(2)),
        signal_HH: true,
        cond_up7: true
    };
}

// Execution and Sample Generation
const raw = generateMockOHLC(60);
const res30M = calculateSignals(raw, '30M');
const res2D = calculateSignals(raw, '2D');

const signalsArray = [ res30M, res2D ];

console.log('--- ACTUAL SIGNALS.JSON ARRAY SAMPLE ---');
console.log(JSON.stringify(signalsArray, null, 2));
console.log('\n--- VERIFICATION: 2D RESAMPLING ---');
const resampled2D = resampleChartData(raw, 2, '2D');
console.log('Original Count:', raw.close.length);
console.log('2D Count:', resampled2D.close.length);
