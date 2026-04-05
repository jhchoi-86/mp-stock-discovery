const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    try {
        const reports = await prisma.report.findMany({
            orderBy: { sentAt: 'desc' },
            take: 100
        });
        const target = reports.find(r => r.id.startsWith('1e39e2bf'));
        if (target) {
            console.log('--- REPORT CONTENT START (ID: ' + target.id + ') ---');
            console.log(target.content);
            console.log('--- REPORT CONTENT END ---');
        } else {
            console.log('No report found with prefix 1e39e2bf among last 100');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
main();
