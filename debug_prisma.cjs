const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Available models in prisma:');
    console.log(Object.keys(prisma).filter(k => !k.startsWith('$') && !k.startsWith('_')));
    
    try {
        const count = await prisma.dailyTop5.count();
        console.log('DailyTop5 count:', count);
        
        const latest = await prisma.dailyTop5.findMany({
            orderBy: { date: 'desc' },
            take: 5
        });
        console.log('Latest Top 5 from DB:', JSON.stringify(latest, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    } catch (e) {
        console.error('Error querying dailyTop5:', e.message);
    }
}

main().finally(() => prisma.$disconnect());
