const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Latest SyncSaveLog ---');
  const latestLog = await prisma.syncSaveLog.findFirst({
    orderBy: { savedAt: 'desc' }
  });
  console.log('Latest SyncSaveLog TagName:', latestLog?.tagName);
  console.log('Latest SyncSaveLog SavedAt:', latestLog?.savedAt);
  if (latestLog) {
      const stocks = latestLog.snapshot;
      console.log('Stocks in Snapshot:', stocks.map(s => `${s.name} (${s.code}) score=${s.score}`));
  }

  console.log('\n--- Latest DailyTop5 ---');
  const latestEntry = await prisma.dailyTop5.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log('Latest DailyTop5 Date:', latestEntry?.date);
  console.log('Latest DailyTop5 CreatedAt:', latestEntry?.createdAt);

  const today = latestEntry ? latestEntry.date : new Date().toISOString().split('T')[0];
  const top5 = await prisma.dailyTop5.findMany({
    where: { date: today },
    orderBy: { score: 'desc' }
  });
  console.log(`DailyTop5 for ${today}:`, top5.map(s => `${s.name} (${s.code}) - Score: ${s.score}`));

  console.log('\n--- Latest DailyStockSnapshot for these codes ---');
  for (const s of top5) {
    const snap = await prisma.dailyStockSnapshot.findFirst({
      where: { code: s.code },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`${s.name}: Price=${snap?.currentPrice}, Score=${snap?.score}, CreatedAt=${snap?.createdAt}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
