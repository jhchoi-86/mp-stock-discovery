const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const snapshot = await prisma.dailyStockSnapshot.findFirst({
            where: { code: '241560' },
            orderBy: { createdAt: 'desc' }
        });
        
        const top5 = await prisma.dailyTop5.findFirst({
            where: { code: '241560' },
            orderBy: { date: 'desc' }
        });

        console.log('--- Database Audit (241560) ---');
        console.log('Latest Snapshot:', snapshot ? {
            id: snapshot.id,
            currentPrice: snapshot.currentPrice,
            createdAt: snapshot.createdAt
        } : 'NOT FOUND');
        
        console.log('Latest Top5 Entry:', top5 ? {
            id: top5.id,
            currentPrice: top5.currentPrice,
            date: top5.date
        } : 'NOT FOUND');
        
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
