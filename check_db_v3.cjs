const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const today = '2026-04-07';
    console.log(`[Diagnostic] Querying DailyTop5 for ${today}...`);
    const data = await prisma.dailyTop5.findMany({
        where: { date: today }
    });
    console.log(JSON.stringify(data, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
