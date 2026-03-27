const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const snapshots = await prisma.dailyStockSnapshot.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(snapshots.map(s => ({
    id: s.id,
    code: s.code,
    createdAt: s.createdAt,
    iso: s.createdAt.toISOString()
  })), null, 2));
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
