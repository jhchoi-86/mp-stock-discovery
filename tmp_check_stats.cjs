const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const stats = await prisma.systemStat.findMany({
            orderBy: { date: 'desc' },
            take: 5
        });
        console.log('--- SYSTEM STATS ---');
        console.log(JSON.stringify(stats, null, 2));

        const userCount = await prisma.user.count();
        console.log('--- USER COUNT ---');
        console.log(userCount);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

check();
