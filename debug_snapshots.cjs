const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const stats = await prisma.dailyStockSnapshot.groupBy({
            by: ['syncDate'],
            _count: { ticker: true },
            orderBy: { syncDate: 'desc' },
            take: 10
        });
        console.log('--- SyncDate Distribution ---');
        stats.forEach(s => {
            console.log(`${s.syncDate ? s.syncDate.toISOString() : 'NULL'}: ${s._count.ticker} stocks`);
        });

        const latestSync = await prisma.dailyStockSnapshot.findFirst({
            orderBy: { syncDate: 'desc' },
            select: { syncDate: true }
        });
        
        if (latestSync) {
            const highScores = await prisma.dailyStockSnapshot.count({
                where: {
                    syncDate: latestSync.syncDate,
                    hybridScore: { gte: 70 }
                }
            });
            console.log(`\nLatest Sync (${latestSync.syncDate.toISOString()}) has ${highScores} stocks with score >= 70`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
