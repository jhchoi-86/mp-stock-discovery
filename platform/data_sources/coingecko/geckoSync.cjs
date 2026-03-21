// cron: '0 0 * * 1' (주 1회 갱신)
const axios = require('axios');
// const prisma = require('../../infra/db/prismaClient.cjs');

async function syncCoinGeckoTop100() {
  console.log('[GeckoSync] Syncing Top 100 Crypto Market Cap...');
  
  // 1. Fetch from Gecko
  // const resp = await axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=krw&order=market_cap_desc&per_page=100');
  const upcomingSymbols = ['BTC', 'ETH', 'SOL']; 

  // 2. [RED TEAM: 다이내믹 웜업] 기존 DB에 없는 신규 코인이면 과거 200봉 REST로 적재
  // const existing = await prisma.instrument.findMany({ where: { market: 'crypto' }});
  const existingSymbols = ['BTC']; // mock
  
  for (const s of upcomingSymbols) {
    if (!existingSymbols.includes(s)) {
      console.log(`[GeckoSync] 다이내믹 웜업 발동! 신규 코인 식별됨: ${s}. 과거 200봉 조회 중...`);
      await fetchWarmupDataFromExchange(s); // Upbit/Binance REST 호출하여 캔들 DB 적재
      
      // DB 추가
      // await prisma.instrument.create({ data: { symbol: s, market: 'crypto', currency: 'KRW' } });
      console.log(`[GeckoSync] 웜업 완료 및 감시 리스트 추가: ${s}`);
    }
  }
}

async function fetchWarmupDataFromExchange(symbol) {
  // Mock warmup fetch (Upbit 캔들 REST 과거 200개 조회)
  await new Promise(r => setTimeout(r, 100));
}

module.exports = { syncCoinGeckoTop100 };
