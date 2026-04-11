const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const codes = ['028050', '375500', '120110', '003030', '218410'];

async function main() {
    try {
        console.log('Checking DB for codes:', codes);
        const rows = await prisma.dailyStockSnapshot.findMany({
            where: { code: { in: codes } },
            orderBy: { createdAt: 'desc' }
        });
        
        const latestByCode = {};
        rows.forEach(r => {
            if (!latestByCode[r.code]) {
                latestByCode[r.code] = {
                    code: r.code,
                    name: r.name,
                    price: r.currentPrice,
                    score: r.score,
                    starGrade: r.starGrade,
                    entry1: r.entryPrice1,
                    entry2: r.entryPrice2,
                    target: r.targetPrice1,
                    sl: r.stopLoss,
                    createdAt: r.createdAt
                };
            }
        });
        
        console.log('--- LATEST SNAPSHOTS FROM DB ---');
        console.log(JSON.stringify(latestByCode, null, 2));
        
        // Also check Redis cache if possible
        try {
            const redis = require('./platform/infra/redis/client.cjs');
            const cacheKey = 'mp:top:5';
            const cached = await redis.get(cacheKey);
            if (cached) {
                console.log('--- REDIS CACHE CONTENT ---');
                console.log(JSON.stringify(JSON.parse(cached), null, 2));
            } else {
                console.log('--- REDIS CACHE EMPTY ---');
            }
        } catch (re) {
            console.log('Redis check failed:', re.message);
        }

    } catch (e) {
        console.error('DB Check failed:', e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
main();
