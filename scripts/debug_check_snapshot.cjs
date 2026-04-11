const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const s = await prisma.dailyStockSnapshot.findFirst({
            where: { code: '086450' }, // 동국제약
            orderBy: { createdAt: 'desc' }
        });
        console.log('Snapshot for 086450:', JSON.stringify(s, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
