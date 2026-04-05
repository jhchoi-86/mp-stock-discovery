const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    console.log('Checking reports for 2026-04-02...');
    const start = new Date('2026-04-01T15:00:00.000Z'); // KST 4/2 00:00
    const end = new Date('2026-04-02T15:00:00.000Z');   // KST 4/3 00:00
    
    const reports = await prisma.report.findMany({
        where: {
            sentAt: { gte: start, lt: end }
        },
        orderBy: { sentAt: 'desc' }
    });
    
    console.log(`Found ${reports.length} reports.`);
    reports.forEach((r, idx) => {
        console.log(`--- Report ${idx+1} ---`);
        console.log(`ID: ${r.id}`);
        console.log(`SentAt: ${r.sentAt}`);
        console.log(`Content Sample: ${r.content.substring(0, 200).replace(/\n/g, ' ')}...`);
    });
    
    await prisma.$disconnect();
}
check();
