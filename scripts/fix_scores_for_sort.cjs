const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const scores = {
    '006360': 100, // GS건설
    '375500': 96,  // DL이앤씨
    '047040': 88,  // 대우건설
    '009150': 80,  // 삼성전기
    '011170': 80   // 롯데케미칼
  };

  console.log('Starting score update for sorting alignment...');
  
  for (const [code, score] of Object.entries(scores)) {
    console.log(`Updating ${code} to ${score} points...`);
    
    // Update DailyStockSnapshot
    await prisma.dailyStockSnapshot.updateMany({
      where: { code: code },
      data: { score: score }
    });

    // Update DailyTop5
    await prisma.dailyTop5.updateMany({
      where: { code: code },
      data: { score: score }
    });
  }

  console.log('All scores synchronized. Sorting logic will now follow these values.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
