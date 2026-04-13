const axios = require('axios');

async function testYahooPrice(code) {
    const symbol = code + '.KS';
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - (86400 * 30); // 30 days
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
    
    try {
        const res = await axios.get(url, { timeout: 10000 });
        const result = res.data.chart.result[0];
        const lastPrice = result.indicators.quote[0].close.slice(-1)[0];
        const lastTime = result.timestamp.slice(-1)[0];
        const lastDate = new Date(lastTime * 1000).toISOString();
        
        console.log(`Yahoo Price for ${symbol}:`);
        console.log(`Last Close: ${lastPrice}`);
        console.log(`Last Date: ${lastDate}`);
    } catch (e) {
        console.error(`Yahoo Error: ${e.message}`);
    }
}

testYahooPrice('095610');
