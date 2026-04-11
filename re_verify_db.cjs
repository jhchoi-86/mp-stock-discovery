const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
    try {
        const count = await prisma.dailyStockSnapshot.count({
            where: { date: '2026-04-05' }
        });
        console.log(`[RE-VERIFY_RESULT] 2026-04-05 Count: ${count}`);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

verify();
