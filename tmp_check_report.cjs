const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    try {
        const r = await prisma.report.findFirst({
            where: {
                sentAt: {
                    gte: new Date('2026-04-01T00:00:00Z'),
                    lt: new Date('2026-04-02T00:00:00Z')
                }
            },
            orderBy: { sentAt: 'desc' }
        });
        if (r) {
            console.log('--- REPORT CONTENT START ---');
            console.log(r.content);
            console.log('--- REPORT CONTENT END ---');
        } else {
            console.log('No report found for 2026-04-01');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
main();
