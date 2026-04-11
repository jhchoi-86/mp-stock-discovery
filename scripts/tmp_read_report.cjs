const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const report = await prisma.report.findFirst({
        orderBy: { sentAt: 'desc' }
    });
    if (report) {
        process.stdout.write(report.content);
    } else {
        process.stdout.write('No report found');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
