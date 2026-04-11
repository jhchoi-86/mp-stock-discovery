const axios = require('axios');
const winston = require('../../infra/logger/winston.cjs'); // assuming it exists

function mapTimeframe(tf) {
  const map = { '15m': '15m', '1h': '60m', '1d': '1d' };
  return map[tf] || '1d';
}

async function fetchFromPolygon(symbol, timeframe) {
  try {
    // 🚨 Polygon.io Fallback 로직 
    // const resp = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}...`);
    winston.info(`[YahooFallback] Polygon used for ${symbol} instead of Yahoo.`);
    return {
      close: 0, open: 0, high: 0, low: 0, volume: 0,
      time: Date.now(),
      source: 'polygon', is_valid: true, fetched_at: Date.now()
    };
  } catch (e) {
    winston.error(`[YahooFallback] Polygon also failed for ${symbol}`);
    throw e;
  }
}

async function fetchOHLC(symbol, timeframe) {
  try {
    const resp = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
      params: { interval: mapTimeframe(timeframe), range: '1mo' },
      timeout: 3000 // 3초 제한
    });
    const data = resp.data.chart.result[0];
    
    // validation check
    if (!data || !data.indicators || !data.indicators.quote[0]) {
      throw new Error('Yahoo invalid data format');
    }

    return {
      close: data.indicators.quote[0].close[0],
      open:  data.indicators.quote[0].open[0],
      high:  data.indicators.quote[0].high[0],
      low:   data.indicators.quote[0].low[0],
      volume: data.indicators.quote[0].volume[0],
      time:  data.timestamp[0],
      source: 'yahoo', is_valid: true, fetched_at: Date.now()
    };
  } catch (e) {
    winston.error(`[YahooConnector] Fetch failed for ${symbol}, initiating fallback...`);
    // Fallback → Polygon.io (30초 내 운영자 알람 처리)
    return await fetchFromPolygon(symbol, timeframe);
  }
}

module.exports = { fetchOHLC };
