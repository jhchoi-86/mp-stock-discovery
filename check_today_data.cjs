const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const today = '2026-04-14';
  const todayStart = new Date('2026-04-14T00:00:00Z');
  const todayEnd = new Date('2026-04-14T23:59:59Z');

  console.log(`--- Audit for ${today} ---`);

  // 1. DailyStockSnapshot
  const snapshotCount = await prisma.dailyStockSnapshot.count({
    where: {
      createdAt: {
        gte: todayStart,
        lte: todayEnd
      }
    }
  });
  console.log(`DailyStockSnapshot count (createdAt today): ${snapshotCount}`);

  const snapshotTop5Count = await prisma.dailyStockSnapshot.count({
    where: {
      createdAt: {
        gte: todayStart,
        lte: todayEnd
      },
      isTop5: true
    }
  });
  console.log(`DailyStockSnapshot count (isTop5: true): ${snapshotTop5Count}`);

  // 2. DailySignalHistory
  const signalHistory = await prisma.dailySignalHistory.findMany({
    where: { date: today }
  });
  console.log(`DailySignalHistory count: ${signalHistory.length}`);
  if (signalHistory.length > 0) {
    console.log('Sample Signal History (first 2):');
    console.log(JSON.stringify(signalHistory.slice(0, 2), null, 2));
  }

  // 3. DailyTop5
  const top5History = await prisma.dailyTop5.findMany({
    where: { date: today }
  });
  console.log(`DailyTop5 count: ${top5History.length}`);
  if (top5History.length > 0) {
    console.log('Sample DailyTop5:');
    console.log(JSON.stringify(top5History, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
