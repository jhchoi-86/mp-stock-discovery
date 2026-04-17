/**
 * MP Stock Discovery - TradingView Chart Utility
 * [Step 2] 종목코드 및 시장에 따른 표준 차트 URL 생성
 */

export const getChartUrl = (ticker, market) => {
  if (!ticker) return '#';
  
  // COIN -> UPBIT:{ticker}
  if (market === 'COIN') {
    return `https://www.tradingview.com/chart/?symbol=UPBIT:${ticker}`;
  }

  // KR_STOCK (주식) -> KRX:{ticker}
  return `https://www.tradingview.com/chart/?symbol=KRX:${ticker}`;
};

