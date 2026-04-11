const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    console.log('---AUDIT_REPORT_START---');
    try {
        const snapshots = await prisma.dailyStockSnapshot.findMany({
            where: { createdAt: { lte: new Date('2026-04-06') } },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        snapshots.forEach(s => {
            console.log(`[D] ${s.createdAt.toISOString()} | ${s.code} | ${s.name} | E1:${s.entryPrice1} | E2:${s.entryPrice2} | SL:${s.stopLoss} | TP1:${s.targetPrice1} | S:${s.score}`);
        });

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        console.log('---AUDIT_REPORT_END---');
        await prisma.$disconnect();
    }
}

main();
