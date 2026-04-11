const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const today = new Date().toISOString().split('T')[0];
    const stocks = ['093370', '097950', '028050', '096770', '066970'];
    console.log(`[Check] Searching for today's snapshots (${today}) for Top 5...`);
    
    const snaps = await prisma.dailyStockSnapshot.findMany({
        where: {
            code: { in: stocks },
            createdAt: { gte: new Date(today) }
        },
        orderBy: { createdAt: 'desc' }
    });
    
    console.log(JSON.stringify(snaps, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
