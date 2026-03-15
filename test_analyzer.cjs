const { calculateSignals } = require('./analyzer.cjs');
const stockCode = '282330'; // BGF리테일
const symbol = stockCode + '.KS';
const days = 365;
const period1 = Math.floor(Date.now() / 1000) - (86400 * days);
const period2 = Math.floor(Date.now() / 1000);
const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    .then(r => r.json())
    .then(data => {
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
        try {
            const signal = calculateSignals(history);
            console.log("Calculated Signal:", signal);
        } catch(e) {
            console.error("calculateSignals error:", e);
        }
    }).catch(console.error);
