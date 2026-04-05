const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const rs = await prisma.report.findMany({
            where: { content: { contains: '성광벤드' } },
            orderBy: { sentAt: 'desc' },
            take: 1
        });
        if (rs.length > 0) {
            console.log('--- CONTENT START ---');
            console.log(rs[0].content);
            console.log('--- CONTENT END ---');
        } else {
            console.log('No reports found for stock.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
