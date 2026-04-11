// dump_top5.cjs
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
BigInt.prototype.toJSON = function() { return this.toString() };

async function run() {
    try {
        // Get Top 5 (most recent snapshots)
        const top5 = await prisma.dailyStockSnapshot.findMany({
            orderBy: { id: 'desc' },
            take: 5
        });
        
        // Get SK Innovation specifically
        const sk = await prisma.dailyStockSnapshot.findFirst({
            where: { code: '096770' },
            orderBy: { id: 'desc' }
        });

        console.log('--- DATA START ---');
        console.log(JSON.stringify({ top5, sk }, null, 2));
        console.log('--- DATA END ---');
    } catch (e) {
        console.error('Extraction Failed:', e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
run();
