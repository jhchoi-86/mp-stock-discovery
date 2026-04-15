const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.dailyStockSnapshot.count();
  console.log('Total snapshots in DB:', total);
  
  const latest = await prisma.dailyStockSnapshot.findMany({
    orderBy: { syncDate: 'desc' },
    take: 5
  });
  
  console.log('Latest 5 snapshots by syncDate:');
  latest.forEach(s => {
    console.log(`- ${s.ticker}: ${s.syncDate.toISOString()} (isTop5: ${s.isTop5})`);
  });

  const latestCreated = await prisma.dailyStockSnapshot.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('Latest 5 snapshots by createdAt:');
  latestCreated.forEach(s => {
    console.log(`- ${s.ticker}: ${s.createdAt.toISOString()} (syncDate: ${s.syncDate.toISOString()})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
