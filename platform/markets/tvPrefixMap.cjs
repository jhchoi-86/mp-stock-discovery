const TV_PREFIX = {
  kr_kospi:  'KRX',
  kr_kosdaq: 'KRX',
  us_nasdaq:  'NASDAQ',
  crypto:     'BINANCE',
};

function buildChartUrl(instrument) {
  const symbol = instrument.symbol || instrument.ticker || '';
  if (instrument.market === 'crypto' || instrument.market === 'COIN') {
    if (instrument.currency === 'KRW' || instrument.source === 'upbit') {
      return `https://www.tradingview.com/chart/?symbol=UPBIT:${symbol}${symbol.endsWith('KRW') ? '' : 'KRW'}`;
    }
    return `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}${symbol.endsWith('USDT') ? '' : 'USDT'}`;
  }
  
  // KR_STOCK (주식) -> KRX:{symbol}
  return `https://www.tradingview.com/chart/?symbol=KRX:${symbol}`;
}

module.exports = { buildChartUrl };
