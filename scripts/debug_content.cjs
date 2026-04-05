const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
    try {
        const r = await prisma.report.findFirst({
            where: { content: { contains: '1차 매수진입가' } },
            orderBy: { sentAt: 'desc' }
        });
        if (r) {
            console.log('--- REPORT CONTENT SAMPLE ---');
            console.log(r.content.substring(0, 2000));
        } else {
            console.log('No matching report found.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
