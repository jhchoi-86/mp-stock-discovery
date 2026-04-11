
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- DB SYNC VERIFICATION (v7.8.20+) ---');
        
        // 1. Get the most recent timestamp
        const latestEntry = await prisma.dailyStockSnapshot.findFirst({
            orderBy: { createdAt: 'desc' }
        });
        
        if (!latestEntry) {
            console.log('No data found in DailyStockSnapshot.');
            return;
        }

        const latestTime = latestEntry.createdAt;
        console.log('Latest Sync Timestamp:', latestTime.toISOString());
        
        // 2. Find all entries from this specific sync batch (allow for a small window of a few seconds)
        const batchStart = new Date(latestTime.getTime() - 30000); // 30 seconds buffer
        const batchEnd = new Date(latestTime.getTime() + 5000);

        const batchTop5 = await prisma.dailyStockSnapshot.findMany({
            where: {
                createdAt: {
                    gte: batchStart,
                    lte: batchEnd
                }
            },
            orderBy: { score: 'desc' },
            take: 10
        });

        console.log(`\n--- TOP 10 FROM LATEST SYNC (Batch Window: ${batchStart.toISOString()} ~ ${batchEnd.toISOString()}) ---`);
        batchTop5.forEach((s, i) => {
            console.log(`${i+1}. ${s.name} (${s.code}) - Score: ${s.score}, Price: ${s.currentPrice}, Entry: ${s.entryPrice1}, Target: ${s.targetPrice1}`);
        });

        // 3. Check Overall High Scorers from today (KST)
        const today = new Date();
        today.setHours(today.getHours() + 9); // KST offset
        today.setHours(0,0,0,0);
        today.setHours(today.getHours() - 9); // Back to UTC for DB query

        const overallToday = await prisma.dailyStockSnapshot.findMany({
            where: {
                createdAt: { gte: today }
            },
            orderBy: { score: 'desc' },
            take: 5
        });

        console.log('\n--- OVERALL TOP 5 FROM TODAY (KST) ---');
        overallToday.forEach((s, i) => {
            console.log(`${i+1}. ${s.name} (${s.code}) - Score: ${s.score}, Price: ${s.currentPrice}, CreatedAt: ${s.createdAt.toISOString()}`);
        });

    } catch (e) {
        console.error('Check failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
