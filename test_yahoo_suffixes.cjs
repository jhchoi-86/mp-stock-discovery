const axios = require('axios');

async function testYahooWrongSuffix(code) {
    const symbols = [code + '.KS', code + '.KQ'];
    
    for (const symbol of symbols) {
        const period2 = Math.floor(Date.now() / 1000);
        const period1 = period2 - (86400 * 30);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
        
        try {
            const res = await axios.get(url, { timeout: 10000 });
            const result = res.data.chart.result[0];
            const lastClose = result.indicators.quote[0].close.slice(-1)[0];
            console.log(`${symbol}: Last Close = ${lastClose}`);
        } catch (e) {
            console.log(`${symbol}: Error = ${e.message}`);
        }
    }
}

testYahooWrongSuffix('095610');
