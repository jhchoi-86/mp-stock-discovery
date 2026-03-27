const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const start = new Date('2026-03-26T00:00:00Z');
    const end = new Date('2026-03-26T23:59:59Z');
    
    const count = await prisma.dailyStockSnapshot.count({
        where: { createdAt: { gte: start, lte: end } }
    });
    
    console.log(`Snapshot Count for 2026-03-26: ${count}`);
    
    // Check specific stocks for v6.2.0 fixes
    const samples = await prisma.dailyStockSnapshot.findMany({
        where: { 
            code: { in: ['348370', '047050', '060280'] },
            createdAt: { gte: start, lte: end }
        },
        select: { code: true, name: true, score: true, yield: true, createdAt: true, foreignBuy: true, instBuy: true }
    });
    console.log('Verification Samples:', JSON.stringify(samples, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
