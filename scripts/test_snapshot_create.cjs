const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testCreate() {
    try {
        console.log('[Test] Attempting to create DailyStockSnapshot...');
        const result = await prisma.dailyStockSnapshot.create({
            data: {
                code: '086450',
                name: '동국제약',
                category: '테스트',
                score: 99,
                currentPrice: 30000,
                tradeAmount: BigInt(5000000000), // BigInt test
                foreignBuy: '1000',
                instBuy: '2000',
                aiComment: 'Test comment',
                createdAt: new Date()
            }
        });
        console.log('[Test] Success! Record ID:', result.id);
    } catch (e) {
        console.error('[Test] FAILED:', e);
    } finally {
        await prisma.$disconnect();
    }
}

testCreate();
