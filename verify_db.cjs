const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
    try {
        const latest = await prisma.dailyStockSnapshot.findFirst({
            orderBy: { createdAt: 'desc' }
        });

        if (latest) {
            console.log('--- DATABASE VERIFICATION REPORT ---');
            console.log('Status: SUCCESS');
            console.log(`Latest Update: ${latest.name} (${latest.code})`);
            console.log(`Sync Time: ${latest.createdAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
            console.log(`Current Price: ${latest.currentPrice.toLocaleString()}원`);
            console.log(`Score: ${Math.round(latest.score)}점`);
            console.log(`Entry 1 (Guarded): ${latest.entryPrice1.toLocaleString()}원`);
            console.log(`Target 1 (Guarded): ${latest.targetPrice1.toLocaleString()}원`);
            console.log('------------------------------------');
        } else {
            console.log('Error: No data found in DailyStockSnapshot table.');
        }
    } catch (e) {
        console.error('Database Connection Error:', e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

verify();
