const fs = require('fs');

function testResample() {
    // Generate dummy 1H data for 1 day
    // Let's say 6 candles per day
    const chartData = {
        open: [100, 102, 104, 106, 108, 110],
        high: [105, 106, 107, 108, 112, 115],
        low: [98, 100, 101, 102, 105, 108],
        close: [102, 104, 106, 108, 110, 112],
        volume: [10, 20, 30, 40, 50, 60],
        time: [
            1710979200, // 2024-03-21 09:00 KST
            1710982800, // 2024-03-21 10:00 KST
            1710986400, // 2024-03-21 11:00 KST
            1710990000, // 2024-03-21 12:00 KST
            1710993600, // 2024-03-21 13:00 KST
            1710997200  // 2024-03-21 14:00 KST
        ]
    };

    const resampled = resample2H(chartData);
    console.log("Resampled to 2H:");
    console.log(resampled);
}

function resample2H(chartData) {
    let resampled = { open: [], high: [], low: [], close: [], volume: [], time: [] };
    if (!chartData.time || chartData.time.length === 0) return resampled;

    let currentCandle = null;
    let candleCount = 0;
    let currentDayStr = null;

    for (let i = 0; i < chartData.time.length; i++) {
        // Get KST day string
        const date = new Date(chartData.time[i] * 1000);
        date.setUTCHours(date.getUTCHours() + 9);
        const dayStr = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;

        if (currentDayStr !== dayStr) {
            // New day resets the pairing
            if (currentCandle) {
                pushCandle(resampled, currentCandle);
            }
            currentDayStr = dayStr;
            currentCandle = createNewCandle(chartData, i);
            candleCount = 1;
        } else {
            if (candleCount === 0) {
                currentCandle = createNewCandle(chartData, i);
                candleCount = 1;
            } else {
                // Merge into current
                currentCandle.high = Math.max(currentCandle.high, chartData.high[i]);
                currentCandle.low = Math.min(currentCandle.low, chartData.low[i]);
                currentCandle.close = chartData.close[i];
                currentCandle.volume += chartData.volume[i];
                candleCount++;
                
                // If we reached 2 candles (2H), close it
                if (candleCount === 2) {
                    pushCandle(resampled, currentCandle);
                    currentCandle = null; // Next will start a new candle
                    candleCount = 0;
                }
            }
        }
    }

    if (currentCandle) {
        pushCandle(resampled, currentCandle);
    }
    
    // Copy real-time KIS overlay if available
    if (chartData.kis_change_data) {
        resampled.kis_change_data = chartData.kis_change_data;
    }

    return resampled;
}

function createNewCandle(raw, idx) {
    return {
        open: raw.open[idx],
        high: raw.high[idx],
        low: raw.low[idx],
        close: raw.close[idx],
        volume: raw.volume[idx],
        time: raw.time[idx]
    };
}

function pushCandle(resampled, candle) {
    resampled.open.push(candle.open);
    resampled.high.push(candle.high);
    resampled.low.push(candle.low);
    resampled.close.push(candle.close);
    resampled.volume.push(candle.volume);
    resampled.time.push(candle.time);
}

testResample();
