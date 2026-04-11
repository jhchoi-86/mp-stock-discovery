const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTimestamps() {
    try {
        const samples = await prisma.dailyStockSnapshot.findMany({
            select: { code: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 350
        });
        
        console.log(`[Total Samples] ${samples.length}`);
        
        const stats = {};
        samples.forEach(s => {
            const dateStr = s.createdAt.toISOString().split('T')[0];
            stats[dateStr] = (stats[dateStr] || 0) + 1;
        });
        
        console.log('[Timestamp Distribution]', JSON.stringify(stats, null, 2));
        
        if (samples.length > 0) {
            console.log('[Earliest Sample]', samples[samples.length - 1].createdAt);
            console.log('[Latest Sample]', samples[0].createdAt);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkTimestamps();
