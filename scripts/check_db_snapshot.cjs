const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSnapshot() {
    console.log('[DB Check] Fetching latest 10 snapshots...');
    
    const snapshots = await prisma.dailyStockSnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    if (snapshots.length === 0) {
        console.log('No snapshots found.');
    } else {
        snapshots.forEach(s => {
            console.log(`ID: ${s.id}, Code: ${s.code}, Name: ${s.name}, Price: ${s.currentPrice}, Yield: ${s.yield}, CreatedAt: ${s.createdAt}`);
        });
    }
}

checkSnapshot()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
