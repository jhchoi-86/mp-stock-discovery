const TV_PREFIX = {
  kr_kospi:  'KRX',
  kr_kosdaq: 'KRX',
  us_nasdaq:  'NASDAQ',
  crypto:     'BINANCE',
};

function buildChartUrl(instrument) {
  if (instrument.market === 'crypto') {
    if (instrument.currency === 'KRW' || instrument.source === 'upbit') {
      return `https://kr.tradingview.com/chart/?symbol=UPBIT:${instrument.symbol}KRW`;
    }
    return `https://kr.tradingview.com/chart/?symbol=BINANCE:${instrument.symbol}USDT`;
  }
  
  const prefix = TV_PREFIX[instrument.market] || 'KRX';
  return `https://kr.tradingview.com/chart/?symbol=${prefix}:${instrument.symbol}`;
}

module.exports = { buildChartUrl };
