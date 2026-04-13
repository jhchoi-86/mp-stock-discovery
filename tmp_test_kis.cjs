const { getKisAccessToken, calculateSignals } = require('./analyzer.cjs');
const axios = require('axios');
require('dotenv').config();

async function run() {
    const token = await getKisAccessToken(false);
    const { prefetchKisCache } = require('./src/utils/kisCache.cjs');
    
    console.log("Token generated:", !!token);
    
    const kiss = await prefetchKisCache([{code:'012450'}], token, {
        KIS_APP_KEY: process.env.KIS_APP_KEY, 
        KIS_APP_SECRET: process.env.KIS_APP_SECRET
    });
    
    console.log("Kiss keys:", Object.keys(kiss));
    
    const stock = { code: '012450', market: 'KOSPI', name: 'Hanwha' };
    const symbolKS = stock.code + '.KS';
    const p1 = Math.floor(Date.now()/1000) - (86400*30);
    const p2 = Math.floor(Date.now()/1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolKS}?period1=${p1}&period2=${p2}&interval=1d`;
    
    const response = await axios.get(url);
    const result = response.data.chart.result[0];
    const quotes = result.indicators.quote[0];
    
    let chartData = {
        open: quotes.open.slice(0, 51),
        close: quotes.close.slice(0, 51),
        high: quotes.high.slice(0, 51),
        low: quotes.low.slice(0, 51),
        volume: quotes.volume.slice(0, 51),
        time: (result.timestamp || []).slice(0, 51)
    };
    
    console.log("Chart initial keys:", Object.keys(chartData));
    
    if (kiss && kiss[stock.code]) {
        const kis = kiss[stock.code];
        const kisData = kis.price;
        if (kisData && kisData.stck_prpr) {
            chartData.kis_change_data = {
                sign: kisData.prdy_vrss_sign,
                change: parseInt(kisData.prdy_vrss)
            };
        }
    }
    
    console.log("Chart Kis Key exists:", !!chartData.kis_change_data);
    
    // Simulate calculateSignals
    const sig = calculateSignals(chartData, '1D');
    
    const payload = {
        ...sig,
        kis_change_data: chartData.kis_change_data
    };
    
    console.log("Payload Kis Key exists:", !!payload.kis_change_data);
    console.log("Keys of payload:", Object.keys(payload));
}

run().catch(console.error);
