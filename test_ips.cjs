const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function m() {
  const s = await prisma.stock.findFirst({
    where: { name: '원익IPS' },
    include: { timeframeStatus: true }
  });
  console.log(JSON.stringify(s, null, 2));
}
m().finally(() => prisma.$disconnect());
