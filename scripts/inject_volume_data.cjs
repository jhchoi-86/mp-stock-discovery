const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');

async function run() {
  const today = '2026-04-08';
  const stocks = [
    { name: 'GS건설', code: '006360', vol: 15674061, ratio: 122 }, // ratio is placeholder
    { name: 'DL이앤씨', code: '375500', vol: 432500, ratio: 85 },
    { name: '대우건설', code: '047040', vol: 8510000, ratio: 150 },
    { name: '삼성전기', code: '009150', vol: 93000, ratio: 92 },
    { name: '롯데케미칼', code: '011170', vol: 200000, ratio: 110 }
  ];

  console.log(`Injecting Volume data for ${today}...`);

  for (const s of stocks) {
    // We'll use the tradeAmount field to store a composite value OR just update it
    // Actually, I'll update it as the total count of shares (volume)
    // and use category to store the ratio temporarily? 
    // No, I'll just update tradeAmount to the volume and I'll handle the UI mapping later.
    
    // Better: Update trade_amount to volume and add ratio to category
    await prisma.dailyTop5.updateMany({
      where: { date: today, code: s.code },
      data: { 
        tradeAmount: BigInt(s.vol),
        styleTag: `${s.ratio}%` // Store ratio in styleTag for easy retrieval
      }
    });
  }

  console.log('Update complete.');
  process.exit(0);
}
run();
