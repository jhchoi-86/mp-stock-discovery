const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const latest = await prisma.report.findFirst({
            orderBy: { sentAt: 'desc' },
        });
        console.log("LATEST REPORT:");
        console.log(latest.content);
    } catch(e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
