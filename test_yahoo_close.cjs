const axios = require('axios');

async function testYahooClose() {
    const symbol = '014620.KQ';
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - (86400 * 7); // 7 days ago
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
    
    console.log('Fetching:', url);
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = response.data;
    
    const result = data.chart.result[0];
    const quotes = result.indicators.quote[0];
    const timestamps = result.timestamp;
    
    console.log('--- Seongkwang Bend (014620.KQ) Yahoo Price ---');
    if (timestamps) {
        for (let i = 0; i < timestamps.length; i++) {
            const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
            console.log(`Date: ${date}, Close: ${quotes.close[i]}`);
        }
    } else {
        console.log('No data found.');
    }
    console.log('----------------------------------------------');
}

testYahooClose().catch(console.error);
