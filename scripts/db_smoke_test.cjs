const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const total = await prisma.pppWatchlist.count();
        const activeCount = await prisma.pppWatchlist.count({ where: { is_active: true } });
        const expiredCount = await prisma.pppWatchlist.count({ where: { is_active: false } });
        const hasGsellCount = await prisma.pppWatchlist.count({ where: { g_sell: { not: null } } });
        
        const all = await prisma.pppWatchlist.findMany({ select: { tf_values: true } });
        const hasTfValuesCount = all.filter(x => x.tf_values && x.tf_values !== '{}' && x.tf_values !== '[]' && x.tf_values !== null).length;

        console.log(`total: ${total}`);
        console.log(`active: ${activeCount}`);
        console.log(`expired: ${expiredCount}`);
        console.log(`has_gsell: ${hasGsellCount}`);
        console.log(`has_tf_values: ${hasTfValuesCount}`);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
run();
