const PublishingService = require('./src/services/publishingService.cjs');
const publishingService = new PublishingService();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    console.log("Starting Sync Save Test...");
    const mockStocks = [
        {
            code: '005930',
            name: '삼성전자',
            score: 75,
            currentPrice: 80000,
            yield: 1.2,
            tradeAmount: 1000000,
            volRate: 50.5,
            aiComment: 'Test Comment',
            styleTag: 'Test Tag'
        }
    ];

    try {
        const result = await publishingService.publishToAll(mockStocks);
        console.log("RESULT SUCCESS:", result);
    } catch (err) {
        console.error("RESULT FAILED:", err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
