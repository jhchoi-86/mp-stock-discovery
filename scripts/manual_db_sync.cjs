const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const today = new Date().toISOString().split('T')[0];

const top5 = [
  { code: '028050', name: '삼성E&A', score: 85, currentPrice: 48050, changeRate: 5.26, entryPrice1: 46200, entryPrice2: 35000, stopLoss: 34300, targetPrice1: 44202, category: '추세 지속형', tradeAmount: 526009047875n, foreignBuy: 0, instBuy: 0 },
  { code: '096770', name: 'SK이노베이션', score: 83, currentPrice: 121900, changeRate: -1.06, entryPrice1: 117800, entryPrice2: 112700, stopLoss: 110446, targetPrice1: 123320, category: '박스권 횡보', tradeAmount: 85035734800n, foreignBuy: 0, instBuy: 0 },
  { code: '021240', name: '코웨이', score: 80, currentPrice: 72400, changeRate: 7.46, entryPrice1: 71800, entryPrice2: 71300, stopLoss: 69874, targetPrice1: 76508, category: '박스권 횡보', tradeAmount: 44162824600n, foreignBuy: -38952, instBuy: 23411 },
  { code: '012450', name: '한화에어로스페이스', score: 77, currentPrice: 1450000, changeRate: 5.79, entryPrice1: 1410000, entryPrice2: 1310000, stopLoss: 1283800, targetPrice1: 1534231, category: '추세 지속형', tradeAmount: 380916854000n, foreignBuy: 0, instBuy: 0 },
  { code: '278280', name: '천보', score: 77, currentPrice: 52500, changeRate: 0.0, entryPrice1: 50900, entryPrice2: 49350, stopLoss: 48363, targetPrice1: 53092, category: '박스권 횡보', tradeAmount: 4995266950n, foreignBuy: -1893, instBuy: -2849 }
];

async function sync() {
  console.log('Syncing manual Top 5 to DB...');
  for (const s of top5) {
    await prisma.dailyTop5.upsert({
      where: { date_code: { date: today, code: s.code } },
      update: s,
      create: s
    });
  }
  console.log('Success.');
  await prisma.$disconnect();
}

sync().catch(e => { console.error(e); process.exit(1); });
