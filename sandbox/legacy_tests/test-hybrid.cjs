const axios = require('axios');
const fs = require('fs');
const https = require('https');
require('dotenv').config();
const { calculateSignals } = require('./analyzer.cjs');

const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

async function getKisToken() {
    const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET
    });
    return response.data.access_token;
}

async function testHybrid() {
    console.log("1. Fetching KIS Token...");
    const token = await getKisToken();
    const symbol = '005930'; // Samsung
    const symbolKS = '005930.KS'; // Yahoo format

    console.log("2. Fetching Yahoo Historical Data (1d)...");
    const period1 = Math.floor(Date.now() / 1000) - (86400 * 365);
    const period2 = Math.floor(Date.now() / 1000);
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbolKS}?period1=${period1}&period2=${period2}&interval=1d`;
    
    const yahooRes = await axios.get(yahooUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        httpsAgent: new https.Agent({ family: 4 })
    });
    
    const result = yahooRes.data.chart.result[0];
    const quotes = result.indicators.quote[0];
    const timestamps = result.timestamp;
    
    let validIndices = [];
    for (let i = 0; i < quotes.close.length; i++) {
        if (quotes.close[i] !== null && timestamps[i] !== null) {
            validIndices.push(i);
        }
    }

    let chartData = {
        open: validIndices.map(i => quotes.open[i]),
        high: validIndices.map(i => quotes.high[i]),
        low: validIndices.map(i => quotes.low[i]),
        close: validIndices.map(i => quotes.close[i]),
        volume: validIndices.map(i => quotes.volume[i]),
        time: validIndices.map(i => timestamps[i])
    };
    
    console.log(`- Yahoo Extracted ${chartData.close.length} valid candles.`);
    console.log(`- Yahoo Last Candle: O=${chartData.open.slice(-1)[0]}, H=${chartData.high.slice(-1)[0]}, L=${chartData.low.slice(-1)[0]}, C=${chartData.close.slice(-1)[0]}, V=${chartData.volume.slice(-1)[0]}`);

    console.log("3. Fetching KIS Current Price (Real-time)...");
    const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
    const kisRes = await axios.get(kisUrl, {
        headers: {
            'authorization': 'Bearer ' + token,
            'appkey': KIS_APP_KEY,
            'appsecret': KIS_APP_SECRET,
            'tr_id': 'FHKST01010100' // Current price TR
        },
        params: {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": symbol
        }
    });

    const kisData = kisRes.data.output;
    // KIS prpr = current price, hgpr = high, lwpr = low, acml_vol = volume, opnn_prc = open
    const currentPrice = parseInt(kisData.stck_prpr);
    const currentHigh = parseInt(kisData.stck_hgpr);
    const currentLow = parseInt(kisData.stck_lwpr);
    const currentOpen = parseInt(kisData.stck_oprc);
    const currentVolume = parseInt(kisData.acml_vol);

    console.log(`- KIS Real-time: O=${currentOpen}, H=${currentHigh}, L=${currentLow}, C=${currentPrice}, V=${currentVolume}`);

    console.log("4. Merging KIS data into Yahoo Last Candle...");
    // 덮어쓰기 로직: 야후의 마지막 양초가 '오늘' 양초라면 덮어쓰고, 아니면 새 양초로 추가. (보통 장중에는 같은 날짜임)
    const lastIdx = chartData.close.length - 1;
    chartData.open[lastIdx] = currentOpen;
    chartData.high[lastIdx] = Math.max(chartData.high[lastIdx], currentHigh); // 야후 고가(지연)와 KIS 고가 중 더 높은것 (안전)
    chartData.low[lastIdx] = Math.min(chartData.low[lastIdx], currentLow);    // 저가 중 낮은것
    chartData.close[lastIdx] = currentPrice; // 현재가는 무조건 KIS (최신)
    chartData.volume[lastIdx] = currentVolume; // 거래량 무조건 KIS 누적 (최신)

    console.log(`- Merged Last Candle: O=${chartData.open[lastIdx]}, H=${chartData.high[lastIdx]}, L=${chartData.low[lastIdx]}, C=${chartData.close[lastIdx]}`);

    console.log("5. Running Analyzer...");
    const analysis = calculateSignals(chartData);
    
    console.log("✅ Analysis Result:", {
        trend_cond: analysis.cond_up7,
        signal: analysis.signal_HH,
        category: analysis.category,
        adx: analysis.adx,
        entry_price: analysis.entry_price
    });
}

testHybrid().catch(console.error);
