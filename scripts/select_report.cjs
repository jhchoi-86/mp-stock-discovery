const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const r = await prisma.report.findFirst({
    where: { content: { contains: '쏠리드' } },
    orderBy: { sentAt: 'desc' }
  });
  if (r) {
    console.log(r.content);
  }
  await prisma.$disconnect();
}
main();
