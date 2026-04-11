const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- [DB Audit] Starting Query (v2) ---');
  try {
    const dates = await prisma.dailyTop5.findMany({
      select: { date: true },
      distinct: ['date'],
      orderBy: { date: 'desc' }
    });

    console.log('\n--- UNIQUE_DATES (DailyTop5) ---');
    if (dates.length === 0) {
      console.log('No entries found in DailyTop5 table.');
    }

    for (const d of dates) {
      const entries = await prisma.dailyTop5.findMany({ 
        where: { date: d.date },
        orderBy: { score: 'desc' }
      });
      console.log(`\nDate: ${d.date} | Count: ${entries.length}`);
      entries.forEach(e => {
        console.log(`  Score ${e.score}: [${e.code}] ${e.stockName || e.name} (ID: ${e.id})`);
      });
    }

  } catch (err) {
    console.error('Audit Error:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
