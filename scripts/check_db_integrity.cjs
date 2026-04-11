const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
    try {
        const serialize = (obj) => JSON.parse(JSON.stringify(obj, (key, value) => typeof value === 'bigint' ? value.toString() : value));

        const today = new Date();
        const kstDate = new Date(today.getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

        console.log(`--- DailyTop5 records for ${kstDate} ---`);
        const records = await prisma.dailyTop5.findMany({
            where: { date: kstDate },
            orderBy: { score: 'desc' },
            take: 10
        });
        console.log(`Count: ${records.length}`);
        console.log(JSON.stringify(serialize(records), null, 2));

        console.log(`\n--- Latest 5 Global DailyTop5 ---`);
        const latestGlobal = await prisma.dailyTop5.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log(JSON.stringify(serialize(latestGlobal), null, 2));
        
        console.log('\n--- Latest 5 DailyStockSnapshot for 086450 ---');
        const snapshots = await prisma.dailyStockSnapshot.findMany({
            where: { code: '086450' },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log(JSON.stringify(serialize(snapshots), null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
