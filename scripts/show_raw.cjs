const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showContent() {
    try {
        const r = await prisma.report.findFirst({
            where: { content: { contains: '쏠리드' } },
            orderBy: { sentAt: 'desc' }
        });
        if (r) {
            console.log('--- RAW CONTENT START ---');
            console.log(r.content);
            console.log('--- RAW CONTENT END ---');
        } else {
            console.log('No matching report found.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

showContent();
