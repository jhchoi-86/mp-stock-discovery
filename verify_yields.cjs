const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const snapshots = await prisma.dailyStockSnapshot.findMany({
        take: 1000,
        orderBy: { createdAt: 'desc' }
    });

    console.log(`Total snapshots: ${snapshots.length}`);
    const positive = snapshots.filter(s => s.yield > 0);
    const negative = snapshots.filter(s => s.yield < 0);
    const zero = snapshots.filter(s => s.yield === 0 || s.yield === null);

    console.log(`Positive yields: ${positive.length}`);
    console.log(`Negative yields: ${negative.length}`);
    console.log(`Zero/Null yields: ${zero.length}`);

    if (negative.length > 0) {
        console.log('Sample negative yields:');
        negative.slice(0, 5).forEach(s => {
            console.log(`${s.name} (${s.code}): ${s.yield}% (Current: ${s.currentPrice}, Entry: ${s.entryPrice1})`);
        });
    } else {
        console.log('No negative yields found in the last 1000 records.');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
