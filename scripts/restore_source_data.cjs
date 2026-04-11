const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const today = '2026-04-08';
  console.log(`Cleaning up Top 5 data for date: ${today}`);
  
  await prisma.dailyTop5.deleteMany({ where: { date: today } });

  const stocks = [
    { code: '006360', name: 'GS건설', score: 100, currentPrice: 37400, entry1: 25800, target1: 34238, sl: 23961 },
    { code: '375500', name: 'DL이앤씨', score: 96, currentPrice: 95200, entry1: 74100, target1: 88767, sl: 57722 },
    { code: '047040', name: '대우건설', score: 88, currentPrice: 22550, entry1: 16000, target1: 21521, sl: 15121 },
    { code: '009150', name: '삼성전기', score: 80, currentPrice: 514000, entry1: 450000, target1: 500047, sl: 388570 },
    { code: '011170', name: '롯데케미칼', score: 80, currentPrice: 91600, entry1: 78400, target1: 91073, sl: 74480 }
  ];

  for (const s of stocks) {
    console.log(`Restoring ${s.name} (${s.code})...`);
    await prisma.dailyTop5.create({
      data: {
        date: today,
        code: s.code,
        name: s.name,
        score: s.score,
        currentPrice: s.currentPrice,
        entryPrice1: s.entry1,
        entryPrice2: s.entry1 * 0.95, // Default calculation
        targetPrice1: s.target1,
        stopLoss: s.sl,
        yield: 0,
        category: '추세 지속형',
        tradeAmount: BigInt(39776457250), // Example from user report
        foreignBuy: 0,
        instBuy: 0,
        styleTag: 'Premium'
      }
    });

    await prisma.dailyStockSnapshot.updateMany({
      where: { code: s.code },
      data: { 
        score: s.score, 
        currentPrice: s.currentPrice,
        entryPrice1: s.entry1,
        targetPrice1: s.target1,
        stopLoss: s.sl,
        category: '추세 지속형'
      }
    });
  }

  console.log('Restoration complete.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
