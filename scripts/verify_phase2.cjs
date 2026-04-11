const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log('--- Phase 2 Verification ---');
  try {
    const snapshots = await prisma.dailyStockSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    console.table(snapshots.map(s => ({
      code: s.code,
      name: s.name,
      volRate: s.volRate,
      e1: s.entryPrice1,
      e2: s.entryPrice2,
      ts: s.createdAt.toISOString()
    })));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}
verify();
