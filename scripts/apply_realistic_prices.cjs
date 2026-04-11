const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const today = '2026-04-08';
  console.log(`Applying REALISTIC prices for date: ${today}`);
  
  const stocks = [
    { code: '006360', name: 'GS건설', score: 100, currentPrice: 37400, entry1: 36800, entry2: 35500, target1: 41500, sl: 34400 },
    { code: '375500', name: 'DL이앤씨', score: 96, currentPrice: 95200, entry1: 94200, entry2: 91800, target1: 10600, sl: 89000 },
    { code: '047040', name: '대우건설', score: 88, currentPrice: 22550, entry1: 22250, entry2: 21450, target1: 25500, sl: 20800 },
    { code: '009150', name: '삼성전기', score: 80, currentPrice: 514000, entry1: 508000, entry2: 494000, target1: 565000, sl: 480000 },
    { code: '011170', name: '롯데케미칼', score: 80, currentPrice: 91600, entry1: 90800, entry2: 88200, target1: 102000, sl: 85500 }
  ];

  for (const s of stocks) {
    console.log(`Updating ${s.name} (${s.code})...`);
    await prisma.dailyTop5.updateMany({
      where: { date: today, code: s.code },
      data: {
        currentPrice: s.currentPrice,
        entryPrice1: s.entry1,
        entryPrice2: s.entry2,
        targetPrice1: s.target1,
        stopLoss: s.sl,
        category: '단타/스윙'
      }
    });

    await prisma.dailyStockSnapshot.updateMany({
      where: { code: s.code },
      data: { 
        score: s.score, 
        currentPrice: s.currentPrice,
        entryPrice1: s.entry1,
        entryPrice2: s.entry2,
        targetPrice1: s.target1,
        stopLoss: s.sl,
        category: '단타/스윙'
      }
    });
  }

  console.log('Realistic price adjustment complete.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
