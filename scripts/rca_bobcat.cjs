const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeBobcat() {
  const code = '241560'; // 두산밥캣
  console.log(`--- [RCA] Analyzing Score History for ${code} ---`);
  try {
    // 1. Check snapshots for today
    const snapshots = await prisma.dailyStockSnapshot.findMany({
      where: { code: code },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    console.log('\n[DailyStockSnapshot History]');
    console.table(snapshots.map(s => ({
      score: s.score,
      price: s.currentPrice,
      foreign: s.foreignBuy,
      inst: s.instBuy,
      created: s.createdAt.toISOString()
    })));

    // 2. Check Signal History
    const signals = await prisma.dailySignalHistory.findMany({
      where: { code: code },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    console.log('\n[DailySignalHistory History]');
    console.table(signals.map(s => ({
      date: s.date,
      created: s.createdAt.toISOString()
    })));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeBobcat();
