const fs = require('fs');

async function testFetchAll() {
    const stocks = JSON.parse(fs.readFileSync('./data/stock_master.json'));
    let errors = [];
    
    const intervalMap = { '1D': '1d' };
    const interval = '1d';
    let days = 60;
    const period1 = Math.floor(Date.now() / 1000) - (86400 * days);
    const period2 = Math.floor(Date.now() / 1000);

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Test a tiny subset or just print failing ones
    for(let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        const suffix = stock.market.includes('KOSPI') ? '.KS' : '.KQ';
        const symbol = stock.code + suffix;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}`;
        
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) {
                errors.push(`${stock.code} (${stock.name}): ${res.status}`);
            } else {
                const data = await res.json();
                if(data.chart.error) errors.push(`${stock.code} (${stock.name}): ${data.chart.error.code}`);
            }
        } catch(e) {
            errors.push(`${stock.code} (${stock.name}): ${e.message}`);
        }
        await sleep(50);
        if (i > 0 && i % 50 === 0) console.log(`Checked ${i} stocks...`);
    }
    
    console.log("Failed stocks:", errors.length);
    if(errors.length > 0) {
        fs.writeFileSync('failed_stocks_log.txt', errors.join('\n'));
        console.log("Logged to failed_stocks_log.txt");
    }
}

testFetchAll();
