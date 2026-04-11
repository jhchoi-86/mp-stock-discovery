const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`[Sync] Synchronizing Foreign/Inst supply data for ${todayStr}...`);

    // 1. Get Today's Top 5
    const top5 = await prisma.dailyTop5.findMany({
        where: { date: todayStr }
    });

    if (top5.length === 0) {
        console.log('[Sync] No Top 5 records found for today.');
        return;
    }

    for (const stock of top5) {
        console.log(`[Sync] Processing ${stock.name} (${stock.code})...`);

        // 2. Find latest snapshot with supply data
        const snapshot = await prisma.dailyStockSnapshot.findFirst({
            where: { 
                code: stock.code,
                createdAt: { gte: new Date(todayStr) }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (snapshot) {
            // We'll use the snapshot's tradeAmount if it exists, but foreignBuy/instBuy are missing in DailyStockSnapshot schema?
            // Let's check the schema first.
        } else {
            console.log(`[Sync] No snapshot found for ${stock.name}.`);
        }
    }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
