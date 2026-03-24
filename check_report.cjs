const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    try {
        const report = await prisma.report.findFirst({ orderBy: { sentAt: 'desc' } });
        console.log(report ? report.content : 'No report');
    } catch(e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
