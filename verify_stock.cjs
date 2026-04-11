const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify(code) {
    try {
        const row = await prisma.dailyStockSnapshot.findFirst({
            where: { code: code },
            orderBy: { createdAt: 'desc' }
        });

        if (row) {
            console.log(JSON.stringify(row, (k, v) => typeof v === 'bigint' ? v.toString() : v));
        } else {
            console.log('NOT_FOUND');
        }
    } catch (e) {
        console.error(e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}

verify(process.argv[2] || '093370');
