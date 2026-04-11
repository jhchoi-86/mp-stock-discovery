
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTop5() {
  try {
    const top5 = await prisma.dailyStockSnapshot.findMany({
      orderBy: { score: 'desc' },
      take: 5
    });

    console.log('--- Current Top 5 in DB ---');
    top5.forEach((s, i) => {
      console.log(`${i + 1}. ${s.name} (${s.code}): ${s.score} pts [Entry: ${s.entryPrice1}, Target: ${s.targetPrice1}] at ${s.createdAt}`);
    });

    const totalCount = await prisma.dailyStockSnapshot.count();
    console.log('\nTotal snapshots in DB:', totalCount);
    
    const latest = await prisma.dailyStockSnapshot.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    console.log('Latest snapshot created at:', latest?.createdAt);

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

checkTop5();
