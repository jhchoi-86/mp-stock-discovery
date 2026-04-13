const axios = require('axios');

async function testYahoo1H(code) {
    const symbol = code + '.KQ';
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - (86400 * 30); // 30 days
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1h`;
    
    try {
        const res = await axios.get(url, { timeout: 10000 });
        const result = res.data.chart.result[0];
        const quotes = result.indicators.quote[0];
        const lastClose = quotes.close.slice(-1)[0];
        const lastTime = result.timestamp.slice(-1)[0];
        const lastDate = new Date(lastTime * 1000).toISOString();
        
        console.log(`Yahoo 1H Price for ${symbol}:`);
        console.log(`Last Close: ${lastClose}`);
        console.log(`Last Date (UTC): ${lastDate}`);
        console.log(`History Count: ${quotes.close.length}`);
    } catch (e) {
        console.error(`Yahoo 1H Error: ${e.message}`);
    }
}

testYahoo1H('095610');
