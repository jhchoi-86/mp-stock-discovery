const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const rs = await prisma.report.findMany({
            orderBy: { sentAt: 'desc' },
            take: 20
        });
        rs.forEach(r => {
            const kst = new Date(r.sentAt.getTime() + 9*3600000);
            console.log(`${kst.toISOString()} | ID: ${r.id.substring(0,8)}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
