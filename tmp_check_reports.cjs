const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function checkReports() {
    try {
        const reports = await prisma.report.findMany({
            orderBy: { sentAt: 'desc' },
            take: 5
        });
        fs.writeFileSync('reports_sample.json', JSON.stringify(reports, null, 2));
        console.log('Successfully wrote 5 reports to reports_sample.json');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkReports();
