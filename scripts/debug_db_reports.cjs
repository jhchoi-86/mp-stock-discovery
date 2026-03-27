const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- RECENT 10 REPORTS (DETAILED) ---');
  const reports = await prisma.report.findMany({
    orderBy: { sentAt: 'desc' },
    take: 10,
    include: { author: { select: { name: true } } }
  });
  
  reports.forEach((r, i) => {
    console.log(`\n[REPORT #${i+1}] ID: ${r.id} | Date: ${r.sentAt}`);
    console.log(`Author: ${r.author?.name || 'Unknown'}`);
    
    // Extract stocks
    const lines = r.content.split('\n');
    const stocks = [];
    lines.forEach(l => {
        if (l.includes('🔹')) stocks.push(l.trim());
    });
    console.log(`Stocks: ${stocks.join(', ') || 'No stocks found'}`);
    console.log('---');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
