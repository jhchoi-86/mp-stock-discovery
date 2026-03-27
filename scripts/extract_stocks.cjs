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

  const lines = report.content.split('\n');
  const stocks = [];
  lines.forEach(line => {
    if (line.includes('🔹')) {
      stocks.push(line.trim());
    }
  });

  console.log('--- 03/27 RECOMMENDATIONS FROM DB ---');
  console.log(stocks.join('\n'));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
