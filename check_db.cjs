const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Record Counts by Date ---');
  const counts = await prisma.dailyTop5.groupBy({
    by: ['date'],
    _count: { code: true }
  });
  console.log(JSON.stringify(counts, null, 2));

  console.log('\n--- Latest 10 Records (Raw) ---');
  const latest = await prisma.dailyTop5.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(latest, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
