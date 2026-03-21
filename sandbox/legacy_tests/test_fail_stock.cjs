const stockCode = process.argv[2] || '282330';
const isKospi = true;
const suffix = isKospi ? '.KS' : '.KQ';
const symbol = stockCode + suffix;

const days = 365;
const period1 = Math.floor(Date.now() / 1000) - (86400 * days);
const period2 = Math.floor(Date.now() / 1000);
const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;

console.log("Url:", url);

fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    .then(r => r.json())
    .then(data => {
        if(data.chart.error) {
            console.log("Error:", data.chart.error);
        } else {
            console.log("Data exists, timestamp array length:", data.chart.result[0].timestamp ? data.chart.result[0].timestamp.length : "undefined");
        }
    }).catch(console.error);
