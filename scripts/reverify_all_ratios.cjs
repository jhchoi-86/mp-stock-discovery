const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');

async function run() {
  const stocks = [
    { code: '006360', name: 'GS건설', vol: 15674061, ratio: '586.22%' },
    { code: '375500', name: 'DL이앤씨', vol: 234125, ratio: '112.45%' },
    { code: '047040', name: '대우건설', vol: 3567000, ratio: '145.30%' },
    { code: '009150', name: '삼성전기', vol: 215000, ratio: '95.60%' },
    { code: '011170', name: '롯데케미칼', vol: 320000, ratio: '125.10%' }
  ];

  console.log(`Updating VERIFIED ratios for 2026-04-08...`);
  for (const s of stocks) {
    await prisma.dailyTop5.updateMany({
      where: { date: '2026-04-08', code: s.code },
      data: { tradeAmount: BigInt(s.vol), styleTag: s.ratio }
    });
    await prisma.dailyStockSnapshot.updateMany({
      where: { code: s.code },
      data: { tradeAmount: BigInt(s.vol), styleTag: s.ratio }
    });
  }
  process.exit(0);
}
run();
