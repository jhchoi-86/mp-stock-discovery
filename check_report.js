const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const r = await prisma.report.findFirst({ orderBy: { sentAt: 'desc' } });
        if (r) {
            console.log('--- CONTENT START ---');
            console.log(r.content);
            console.log('--- CONTENT END ---');
        } else {
            console.log('No reports found.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
