const axios = require('axios');
async function test() {
    const symbol = '047810.KS';
    const period1 = Math.floor(Date.now() / 1000) - (86400 * 5);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const result = response.data.chart.result[0];
        const quotes = result.indicators.quote[0];
        console.log("Yahoo timestamps:", result.timestamp.map(t => new Date(t * 1000).toLocaleString()));
        console.log("Yahoo closes:", quotes.close);
    } catch(e) { console.error(e.message); }
}
test();
