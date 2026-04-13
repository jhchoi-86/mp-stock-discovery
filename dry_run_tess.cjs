const { fetchHybridHistory, calculateSignals, getKisAccessToken, resampleChartData } = require('./analyzer.cjs');
require('dotenv').config();

async function dryRunTess2H() {
    const stock = { code: '095610', name: '테스', market: 'KOSDAQ 150' };
    const kisToken = await getKisAccessToken(true);
    
    console.log(`[Dry Run 2H] Fetching 1H history for ${stock.name}...`);
    // '2H' timeframe in runAnalysis uses interval='1h' and days=90
    const rawHistory = await fetchHybridHistory(stock, 90, '1h', kisToken);
    
    console.log(`[Dry Run 2H] Raw 1H Last Close: ${rawHistory.close.slice(-1)[0]}`);
    
    const finalHistory = resampleChartData(rawHistory, 2, '2H');
    console.log(`[Dry Run 2H] Resampled 2H Last Close: ${finalHistory.close.slice(-1)[0]}`);
    
    const signal = calculateSignals(finalHistory, '2H');
    console.log(`[Dry Run 2H] Signal Price: ${signal.current_price}`);
    console.log(`[Dry Run 2H] Signal Target (result_1): ${signal.result_1}`);
    console.log(`[Dry Run 2H] Last 5 Closes: ${finalHistory.close.slice(-5)}`);
}

dryRunTess2H();
