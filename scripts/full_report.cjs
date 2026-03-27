const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const report = await prisma.report.findFirst({
    orderBy: { sentAt: 'desc' }
  });
  
  if (!report) {
    console.log('No reports found.');
    return;
  }

  console.log('--- FULL REPORT CONTENT ---');
  console.log(report.content);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
