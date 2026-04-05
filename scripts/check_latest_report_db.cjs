const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLatestReport() {
    console.log('[DB Check] Fetching latest report content...');
    const report = await prisma.report.findFirst({
        orderBy: { sentAt: 'desc' }
    });

    if (!report) {
        console.log('No reports found.');
    } else {
        console.log(`ID: ${report.id}, SentAt: ${report.sentAt}`);
        console.log('--- CONTENT (First 1000 chars) ---');
        console.log(report.content.substring(0, 1000));
    }
}

checkLatestReport()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
