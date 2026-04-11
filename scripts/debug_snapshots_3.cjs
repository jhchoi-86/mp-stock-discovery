const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    try {
        const rows = await prisma.dailyStockSnapshot.findMany({
            where: { code: '028050' },
            orderBy: { createdAt: 'desc' },
            take: 3
        });
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
main();
