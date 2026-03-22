const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        const res = await prisma.sniperSignal.upsert({
            where: { signalId: 'SIG_001' },
            update: {},
            create: {
                signalId: 'SIG_001',
                ticker: '005930',
                type: 'ENTRY',
                entryPrice: 85000,
                time: '100000',
                grade: 'S',
                score: 350,
                momentum: {}
            }
        });
        console.log(res);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
