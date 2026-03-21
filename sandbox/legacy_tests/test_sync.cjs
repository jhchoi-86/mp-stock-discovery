const { calculateSignals } = require('./analyzer.cjs');
const fs = require('fs');

async function testFetch() {
    const symbol = '005930.KS'; // Samsung
    const days = 365;
    const period1 = Math.floor(Date.now() / 1000) - (86400 * days);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        const result = data.chart.result[0];
        const quotes = result.indicators.quote[0];
        const timestamps = result.timestamp;
        
        const history = {
            open: quotes.open,
            high: quotes.high,
            low: quotes.low,
            close: quotes.close,
            time: timestamps
        };

        console.log("History length:", history.close.length);
        const signal = calculateSignals(history);
        console.log("Calculated Signal:", signal);
    } catch (e) {
        console.error("Test Failed:", e.stack || e);
    }
}

testFetch();
