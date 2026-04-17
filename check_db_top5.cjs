const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
    console.log('--- Latest SyncSaveLog ---');
    const latestSync = await prisma.syncSaveLog.findFirst({
        orderBy: { savedAt: 'desc' }
    });
    if (latestSync) {
        console.log(`SavedAt: ${latestSync.savedAt}`);
        console.log(`Tag: ${latestSync.tagName}`);
        console.log('Stocks:', latestSync.snapshot.map(s => `${s.name} (${s.code || s.ticker}) @ ${s.currentPrice}`).join(', '));
    } else {
        console.log('No SyncSaveLog found');
    }

    console.log('\n--- Latest DailyTop5 (Today) ---');
    const today = new Date().toISOString().split('T')[0];
    const top5 = await prisma.dailyTop5.findMany({
        where: { date: today },
        orderBy: { score: 'desc' },
        take: 5
    });
    console.log('Stocks:', top5.map(s => `${s.name} (${s.code}) @ ${s.currentPrice}`).join(', '));
}

checkData().finally(() => prisma.$disconnect());
