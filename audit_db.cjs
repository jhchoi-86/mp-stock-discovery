const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
  try {
    const today = new Date(new Date().toISOString().split('T')[0]);
    const count = await prisma.dailyStockSnapshot.count({
      where: { createdAt: { gte: today } }
    });
    console.log(`TODAY_TOTAL_COUNT: ${count}`);

    const cj = await prisma.dailyStockSnapshot.findFirst({
      where: { code: '097950', createdAt: { gte: today } },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`CJ_TODAY_FOUND: ${!!cj}`);
    if (cj) {
        console.log(`CJ_TODAY_PRICE: ${cj.currentPrice}`);
    }

    const latest = await prisma.dailyStockSnapshot.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    console.log(`GLOBAL_LATEST: ${latest?.name} (${latest?.code}) at ${latest?.createdAt.toISOString()}`);

  } catch (e) {
    console.error(e.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

audit();
